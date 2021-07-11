const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  getBlock,
  getChainId,
  increaseBlock,
  increaseTime,
  fixtureDefault,
} = require("../helpers/fixtures.js");

const { checkContractData } = require("../helpers/contractData.js");
const { setOraclePrices } = require("../helpers/utils.js");

const BASE = ethers.utils.parseEther("1");
const maxAmount = ethers.constants.MaxUint256;

let iToken, iToken1, controller, interestRateModel;
let underlying, underlying1;
let users, user1, user2, user3, user4, owner;
let oracle;
let flashloanExecutor, flashloanExecutorFailure;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;

describe("iToken", async function () {
  const rawMintAmount = ethers.BigNumber.from("500");
  const rawBorrowAmout = ethers.BigNumber.from("300");
  const rawLiquidateAmount = ethers.BigNumber.from("90");
  const rawRapyAmount = ethers.BigNumber.from("20");
  let mintAmount = ethers.utils.parseEther("500");
  let redeemAmount = ethers.utils.parseEther("100");
  let borrowAmount = ethers.utils.parseEther("300");
  let repayAmount = ethers.utils.parseEther("50");
  let liquidateAmount = ethers.utils.parseEther("90");
  let flashloanAmount = ethers.utils.parseEther("100");

  async function init() {
    ({
      controller: controller,
      owner: owner,
      iToken0: iToken,
      underlying0: underlying,
      iToken1: iToken1,
      underlying1: underlying1,
      interestRateModel: interestRateModel,
      accounts: users,
      flashloanExecutor: flashloanExecutor,
      flashloanExecutorFailure: flashloanExecutorFailure,
      priceOracle: oracle,
    } = await loadFixture(fixtureDefault));
    [user1, user2, user3, user4] = users;
    await controller
      .connect(user1)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller.connect(user3).enterMarkets([iToken1.address]);
    iTokenDecimals = await iToken.decimals();
    actualiTokenMintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iTokenDecimals)
    );
    iToken1Decimals = await iToken1.decimals();
    actualiToken1MintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iToken1Decimals)
    );
    await iToken.connect(user1).mint(user1.address, actualiTokenMintAmount);
    await iToken.connect(user2).mint(user2.address, actualiTokenMintAmount);
    await iToken1.connect(user1).mint(user1.address, actualiToken1MintAmount);
    await iToken1.connect(user2).mint(user2.address, actualiToken1MintAmount);
    await iToken1.connect(user3).mint(user3.address, actualiToken1MintAmount);
  }

  describe.skip("Test all scenarios for Flashloan", async function () {
    it("Generate a flashloan as expected", async function () {
      // Initialize environments.
      await init();

      // user1 mints iToken.
      await expect(() =>
        iToken.connect(user1).mint(user1.address, mintAmount)
      ).to.changeTokenBalance(iToken, user1, mintAmount);

      const flashloanFeeRate = await iToken.flashloanFeeRatio();
      const flashloanFeeAmount = flashloanFeeRate
        .mul(flashloanAmount)
        .div(BASE);
      const expectRepayAmount = flashloanFeeAmount;

      // add enough undelying token to the flashloan executor contract to repay.
      await underlying
        .connect(user1)
        .transfer(flashloanExecutor.address, flashloanAmount);

      const beforeiTokenCash = await iToken.getCash();
      const beforeExchangeRate = await iToken.exchangeRateStored();
      // execute flashloan.
      await iToken
        .connect(user1)
        .flashloan(flashloanExecutor.address, flashloanAmount, "0x");
      const afteriTokenCash = await iToken.getCash();
      await iToken.connect(user1).exchangeRateCurrent();
      const afterExchangeRate = await iToken.exchangeRateStored();

      expect(afteriTokenCash.sub(beforeiTokenCash)).to.equal(expectRepayAmount);
      expect(afterExchangeRate).to.gt(beforeExchangeRate);
    });

    it("Should revert due to borrow too much cash", async function () {
      const iTokenCurrentCash = await iToken.getCash();
      const flashloanAmount = iTokenCurrentCash.mul(2);
      // execute flashloan.
      await expect(
        iToken
          .connect(user1)
          .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Should revert due to borrow too small", async function () {
      // only borrow 9 wei.
      const flashloanAmount = "9";
      await expect(
        iToken
          .connect(user1)
          .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
      ).to.be.revertedWith(
        "flashloanInternal: Request amount is too small for a flashloan!"
      );
    });

    // // TODO:
    // it("Should revert due to controller refuses", async function () {
    //   await expect(
    //     iToken
    //       .connect(user1)
    //       .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
    //   ).to.be.revertedWith(
    //     "flashloanInternal: Controller refuses to make a flashloan!"
    //   );
    // });

    it("Should revert due to do not repay enough", async function () {
      const iTokenCurrentCash = await iToken.getCash();
      await expect(
        iToken
          .connect(user1)
          .flashloan(flashloanExecutorFailure.address, iTokenCurrentCash, "0x")
      ).to.be.revertedWith("flashloanInternal: Fail to repay borrow with fee!");
    });

    // // TODO:
    // it("Should revert due to controller fails to verify", async function () {
    //   await expect(
    //     iToken
    //       .connect(user1)
    //       .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
    //   ).to.be.revertedWith(
    //     "flashloanInternal: Controller can not verify the flashloan!"
    //   );
    // });
  });

  describe("Test all scenarios for Mint", async function () {
    it("Should mint correctly when exchange rate is equal to 1", async function () {
      // Initialize environments.
      await init();

      let beforeCash = await iToken.getCash();

      // first time to mint, and no borrow, so the exchange rate of iToken should be 1.
      await expect(() =>
        iToken.connect(user1).mint(user1.address, mintAmount)
      ).to.changeTokenBalance(iToken, user1, mintAmount);

      let afterCash = await iToken.getCash();
      expect(afterCash.sub(beforeCash)).to.equal(mintAmount);

      beforeCash = afterCash;
      await expect(() =>
        iToken.connect(user1).mint(user1.getAddress(), mintAmount)
      ).to.changeTokenBalances(
        underlying,
        [user1, iToken],
        [mintAmount.mul(-1), mintAmount]
      );

      afterCash = await iToken.getCash();
      expect(afterCash.sub(beforeCash)).to.equal(mintAmount);
    });

    it("Should mint for another account", async function () {
      // deposit account mint for another account.
      await expect(() =>
        iToken.connect(user1).mint(user3.address, mintAmount)
      ).to.changeTokenBalance(iToken, user3, mintAmount);

      await expect(() =>
        iToken.connect(user1).mint(user3.address, mintAmount)
      ).to.changeTokenBalance(underlying, user1, mintAmount.mul(-1));
    });

    it("Should mint correctly when exchange rate is greater than 1", async function () {
      // In order to make exchange rate is greater than 1, must have a user to borrow cash and update exchange rate.
      // User2 supply underlying2, enter the market with underlying2 and then borrow underlying1.

      // First time to mint, and no borrow, so the exchange rate of the iToken1 should be 1.
      await expect(() =>
        iToken1.connect(user2).mint(user2.address, actualiToken1MintAmount)
      ).to.changeTokenBalance(iToken1, user2, actualiToken1MintAmount);

      // Use the iToken1 as a collateral.
      await controller.connect(user2).enterMarkets([iToken1.address]);

      await iToken.connect(user2).exchangeRateCurrent();
      const beforeExchangeRate = await iToken.exchangeRateStored();
      // Borrow the iToken.
      await expect(() =>
        iToken.connect(user2).borrow(borrowAmount)
      ).to.changeTokenBalance(underlying, user2, borrowAmount);

      // Try to mint when exchange rate is greater than 1.
      const beforeMintUser1UnderlyingBalance = await underlying.balanceOf(
        user1.address
      );
      const beforeMintUser1iTokenBalance = await iToken.balanceOf(
        user1.address
      );
      await iToken.connect(user1).mint(user1.address, mintAmount);
      const afterExchangeRate = await iToken.exchangeRateStored();
      expect(afterExchangeRate).to.gt(beforeExchangeRate);

      const expectediTokenAmount = mintAmount.mul(BASE).div(afterExchangeRate);
      const afterMintUser1UnderlyingBalance = await underlying.balanceOf(
        user1.address
      );
      const afterMintUser1iTokenBalance = await iToken.balanceOf(user1.address);
      const underlyingChanged = beforeMintUser1UnderlyingBalance.sub(
        afterMintUser1UnderlyingBalance
      );
      const iTokenChanged = afterMintUser1iTokenBalance.sub(
        beforeMintUser1iTokenBalance
      );
      expect(underlyingChanged).to.gt(iTokenChanged);
      expect(expectediTokenAmount).to.equal(iTokenChanged);
    });

    it("Should revert due to user do not approve(enough)", async function () {
      // Do not approve.
      await underlying.connect(user1).approve(iToken.address, "0");
      await expect(
        iToken.connect(user1).mint(user1.address, mintAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      // Approve less than mint amount.
      await underlying
        .connect(user1)
        .approve(iToken.address, mintAmount.div("2"));
      await expect(
        iToken.connect(user1).mint(user1.address, mintAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Should revert due to user do not have enough underlying token", async function () {
      const user2UnderlyingBalance = await underlying.balanceOf(user2.address);

      await expect(
        iToken.connect(user2).mint(user2.address, user2UnderlyingBalance.mul(2))
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    // // TODO: mintInternal: Controller refuses to mint!
    // it("Should revert due to controller refuse to mint", async function () {
    //   await expect(
    //     iToken.connect(user2).mint(user2.address, mintAmount)
    //   ).to.be.revertedWith("mintInternal: Controller refuses to mint!");
    // });

    // // TODO: "mintInternal: Controller fails to verify mint!"
    // it("Should revert due to controller refuse to verify mint", async function () {
    //   await expect(
    //     iToken.connect(user2).mint(user2.address, mintAmount)
    //   ).to.be.revertedWith("mintInternal: Controller fails to verify mint!");
    // });
  });

  describe("Test all scenarios for Redeem", async function () {
    it("Should redeem from userself normally", async function () {
      let data = {
        isBefore: true,
        iToken: iToken,
        underlying: underlying,
        functionName: "redeem",
        from: user1.address,
        to: user1.address,
      };
      let returnValue = await checkContractData(data);

      // redeem.
      await expect(() =>
        iToken.connect(user1).redeem(user1.address, redeemAmount)
      ).to.changeTokenBalance(iToken, user1, redeemAmount.mul(-1));

      returnValue["functionName"] = "redeem";
      returnValue["isBefore"] = false;
      returnValue["redeemAmount"] = redeemAmount;
      await checkContractData(returnValue);

      // redeemUnderlying.
      data = {
        isBefore: true,
        iToken: iToken,
        underlying: underlying,
        functionName: "redeemUnderlying",
        from: user1.address,
        to: user1.address,
      };
      returnValue = await checkContractData(data);
      await expect(() =>
        iToken.connect(user1).redeemUnderlying(user1.address, redeemAmount)
      ).to.changeTokenBalance(underlying, user1, redeemAmount);

      returnValue["functionName"] = "redeemUnderlying";
      returnValue["isBefore"] = false;
      returnValue["redeemAmount"] = redeemAmount;
      await checkContractData(returnValue);
    });

    // it("Should revert due to controller refuse", async function () {
    //   await expect(
    //     iToken.connect(user1).redeem(user1.address, redeemAmount)
    //   ).to.be.revertedWith("redeemInternal: Controller refuses to redeem!");

    //   await expect(
    //     iToken.connect(user1).redeemUnderlying(user1.address, redeemAmount)
    //   ).to.be.revertedWith("redeemInternal: Controller refuses to redeem!");
    // });

    // it("Should revert due to controller can not verify", async function () {
    //   await expect(
    //     iToken.connect(user1).redeem(user1.address, redeemAmount)
    //   ).to.be.revertedWith("redeemInternal: Controller fails to verify redeem!");

    //   await expect(
    //     iToken.connect(user1).redeemUnderlying(user1.address, redeemAmount)
    //   ).to.be.revertedWith("redeemInternal: Controller fails to verify redeem!");
    // });

    it("Should revert due to exceed allowance", async function () {
      await expect(
        iToken.connect(user3).redeem(user1.address, redeemAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      await expect(
        iToken.connect(user3).redeemUnderlying(user1.address, redeemAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Redeem should revert due to insufficient cash", async function () {
      await iToken1
        .connect(user2)
        .mint(user2.address, actualiToken1MintAmount.mul(5));
      let currentCash = await iToken.getCash();
      await iToken.connect(user2).borrow(currentCash);
      currentCash = await iToken.getCash();
      expect(currentCash).to.equal(0);

      await expect(
        iToken.connect(user1).redeem(user1.address, redeemAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      await expect(
        iToken.connect(user1).redeemUnderlying(user1.address, redeemAmount)
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });
  });

  describe("Test all scenarios for Borrow", async function () {
    it("Should borrow normally", async function () {
      await init();

      let data = {
        isBefore: true,
        iToken: iToken1,
        underlying: underlying1,
        functionName: "borrow",
        from: user1.address,
        to: user1.address,
      };
      let returnValue = await checkContractData(data);

      let actualBorrowedAmount = rawBorrowAmout.mul(
        ethers.BigNumber.from("10").pow(iToken1Decimals)
      );
      await expect(() =>
        iToken1.connect(user1).borrow(actualBorrowedAmount)
      ).to.be.changeTokenBalance(underlying1, user1, actualBorrowedAmount);

      returnValue["functionName"] = "borrow";
      returnValue["isBefore"] = false;
      returnValue["borrowAmount"] = actualBorrowedAmount;
      await checkContractData(returnValue);
    });

    // it("Borrow should revert due to insufficient cash", async function () {
    //   let currentCash = await iToken.getCash();
    //   let shortfallUser1 = await controller.calcAccountEquity(user1.address);
    //   console.log("shortfallUser1", (shortfallUser1[0]).toString(), (shortfallUser1[1]).toString())
    //   let shortfallUser2 = await controller.calcAccountEquity(user2.address);
    //   console.log("shortfallUser2", (shortfallUser2[0]).toString(), (shortfallUser2[1]).toString())
    //   await expect(
    //     iToken.connect(user1).borrow(currentCash.mul(2))
    //   ).to.be.revertedWith("borrowInternal: Insufficient cash to borrow!");
    // });

    it("Should revert due to controller refuse to borrow", async function () {
      // User has shortfall, so can not borrow more.
      await iToken.connect(user3).borrow(mintAmount.mul(9).div(10));

      let iTokenPrice = await oracle.getUnderlyingPrice(iToken.address);
      await setOraclePrices(oracle, [iToken], [5]);

      let actualBorrowedAmount = rawBorrowAmout.mul(
        ethers.BigNumber.from("10").pow(iToken1Decimals)
      );
      await expect(
        iToken.connect(user3).borrow(actualBorrowedAmount)
      ).to.be.revertedWith("Account has some shortfall");
    });

    // it("Should revert due to controller refuse to borrow", async function () {
    //   await expect(
    //     iToken.connect(user1).borrow(borrowAmount)
    //   ).to.be.revertedWith("borrowInternal: Controller fails to verify borrow!");
    // });
  });

  describe("Test all scenarios for Repay", async function () {
    it("Should repay for user self normally!", async function () {
      let data = {
        isBefore: true,
        iToken: iToken1,
        underlying: underlying1,
        functionName: "repay",
        from: user1.address,
        to: user1.address,
      };
      let returnValue = await checkContractData(data);

      let actualBorrowedAmount = rawRapyAmount.mul(
        ethers.BigNumber.from("10").pow(iToken1Decimals)
      );
      await iToken1.connect(user1).repayBorrow(actualBorrowedAmount);

      returnValue["functionName"] = "repay";
      returnValue["isBefore"] = false;
      returnValue["repayAmount"] = actualBorrowedAmount;
      await checkContractData(returnValue);
    });

    it("Should repay behalf for others normally!", async function () {
      let data = {
        isBefore: true,
        iToken: iToken1,
        underlying: underlying1,
        functionName: "repay",
        from: user2.address,
        to: user1.address,
      };
      let returnValue = await checkContractData(data);

      let actualBorrowedAmount = rawRapyAmount.mul(
        ethers.BigNumber.from("10").pow(iToken1Decimals)
      );
      await iToken1.connect(user1).borrow(actualBorrowedAmount);
      await iToken1
        .connect(user2)
        .repayBorrowBehalf(user1.address, actualBorrowedAmount);

      returnValue["functionName"] = "repay";
      returnValue["isBefore"] = false;
      returnValue["repayAmount"] = actualBorrowedAmount;
      await checkContractData(returnValue);
    });

    // it("Repay borrow should revert due to controller refuses!", async function () {
    //   await expect(
    //     iToken.connect(user1).borrow(borrowAmount)
    //   ).to.be.revertedWith("repay: Controller refuses to repay!");
    // });

    // it("Repay borrow should revert due to controller can not verify!", async function () {
    //   await expect(
    //     iToken.connect(user1).borrow(borrowAmount)
    //   ).to.be.revertedWith("repay: Controller fails to verify repay!");
    // });
  });

  describe("Test all scenarios for liquidate borrow", async function () {
    it("Should liquidate normally", async function () {
      // initialize environment
      await init();

      // Cause user3 only deposits iToken1 at here, and iToken has the same price as iToken1,
      // so max borrowed amount = user3iToken1Balance * 0.9
      let user3iToken1Balance = await iToken1.balanceOf(user3.address);
      let rawMaxBorrowAmount = user3iToken1Balance
        .mul(9)
        .div(10)
        .div(ethers.BigNumber.from(10).pow(iToken1Decimals));
      let actualMaxborrowAmount = rawMaxBorrowAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );

      let liquidateDetails = await controller.calcAccountEquity(user3.address);
      // user3 can not have a shortfall, so he can borrow.
      expect(liquidateDetails[1]).to.equal(0);

      await iToken.connect(user3).borrow(actualMaxborrowAmount);

      // Reduced the price of iToken1, so user3 will have a shortfall.
      await setOraclePrices(oracle, [iToken1], [0]);

      liquidateDetails = await controller.calcAccountEquity(user3.address);
      expect(liquidateDetails[0]).to.equal(0);

      // user2 is going to liquidate user3.
      let actualLiquidateAmount = rawLiquidateAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );

      let data = {
        isBefore: true,
        iToken: iToken1,
        underlying: underlying1,
        functionName: "liquidateBorrow",
        from: user3.address,
        to: user2.address,
      };
      let returnValue = await checkContractData(data);

      await iToken
        .connect(user2)
        .liquidateBorrow(user3.address, actualLiquidateAmount, iToken1.address);

      returnValue["functionName"] = "liquidateBorrow";
      returnValue["isBefore"] = false;
      returnValue["liquidateAmount"] = actualLiquidateAmount;
      await checkContractData(returnValue);
    });

    it("Should revert due to do not allow to liquidate self", async function () {
      let actualLiquidateAmount = rawLiquidateAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );
      await expect(
        iToken
          .connect(user3)
          .liquidateBorrow(
            user3.address,
            actualLiquidateAmount,
            iToken1.address
          )
      ).to.be.revertedWith(
        "liquidateBorrowInternal: Liquidator can not be borrower!"
      );
    });

    it("Should revert due to do not allow to repay 0", async function () {
      await expect(
        iToken
          .connect(user2)
          .liquidateBorrow(user3.address, "0", iToken1.address)
      ).to.be.revertedWith(
        "_liquidateBorrowInternal: Liquidate amount should be greater than 0!"
      );
    });

    // it("Should revert due to do not allow to repay max amount", async function () {
    //   await expect(
    //     iToken
    //       .connect(user2)
    //       .liquidateBorrow(user3.address, maxAmount, iToken1.address)
    //   ).to.be.revertedWith(
    //     "_liquidateBorrowInternal: Liquidate amount should be greater than 0 and amount can not be max!"
    //   );
    // });

    it("Should revert due to controller refuses to liquidate", async function () {
      // User1 do not have a shortfall, so controller will refuse the operation of liquidation.
      let actualLiquidateAmount = rawLiquidateAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );
      await expect(
        iToken
          .connect(user2)
          .liquidateBorrow(
            user1.address,
            actualLiquidateAmount,
            iToken1.address
          )
      ).to.be.revertedWith("Account does not have shortfall");
    });

    // it("Should revert due to failing to repay when liquidates", async function () {
    //   let actualLiquidateAmount = rawLiquidateAmount.mul(ethers.BigNumber.from(10).pow(iTokenDecimals));
    //   await expect(
    //     iToken.connect(user2).liquidateBorrow(user1.address, actualLiquidateAmount, iToken1.address)
    //   ).to.be.revertedWith("liquidateBorrowInternal: Fail to repay when liquidate!");
    // });

    // it("Should revert due to failing to liquidating too much", async function () {
    //   let actualLiquidateAmount = rawLiquidateAmount.mul(ethers.BigNumber.from(10).pow(iTokenDecimals));
    //   await expect(
    //     iToken.connect(user2).liquidateBorrow(user1.address, actualLiquidateAmount, iToken1.address)
    //   ).to.be.revertedWith("liquidateBorrowInternal: Liquidate too much!");
    // });

    // it("Should revert due to failing to seize token", async function () {
    //   let actualLiquidateAmount = rawLiquidateAmount.mul(ethers.BigNumber.from(10).pow(iTokenDecimals));
    //   await expect(
    //     iToken.connect(user2).liquidateBorrow(user1.address, actualLiquidateAmount, iToken1.address)
    //   ).to.be.revertedWith("liquidateBorrowInternal: Token seizure failed!");
    // });

    // it("Should revert due to controller can not verify", async function () {
    //   let actualLiquidateAmount = rawLiquidateAmount.mul(ethers.BigNumber.from(10).pow(iTokenDecimals));
    //   await expect(
    //     iToken.connect(user2).liquidateBorrow(user1.address, actualLiquidateAmount, iToken1.address)
    //   ).to.be.revertedWith("liquidateBorrowInternal: Controller fails to verify liquidate!");
    // });

    it("Liquidate asset that does not be set as collateral", async function () {
      // initialize environment
      await init();

      // Cause user3 only sets iToken1 as collateral at here, although he deposits iToken,
      // and iToken has the same price as iToken1,
      // so max borrowed amount = user3iToken1Balance * 0.9
      let user3iToken1Balance = await iToken1.balanceOf(user3.address);
      // console.log("user3iToken1Balance", user3iToken1Balance.toString());

      // user3 supply iToken, but does not set it as collateral.
      await underlying.connect(user3).approve(iToken.address, maxAmount);
      await iToken
        .connect(user3)
        .mint(user3.address, ethers.utils.parseEther("500"));

      let beforeUser3iTokenBalance = await iToken.balanceOf(user3.address);
      // console.log("beforeUser3iTokenBalance", beforeUser3iTokenBalance.toString());

      let rawMaxBorrowAmount = user3iToken1Balance
        .mul(9)
        .div(10)
        .div(ethers.BigNumber.from(10).pow(iToken1Decimals));
      let actualMaxborrowAmount = rawMaxBorrowAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );

      let liquidateDetails = await controller.calcAccountEquity(user3.address);
      // user3 can not have a shortfall, so he can borrow.
      expect(liquidateDetails[1]).to.equal(0);

      await iToken.connect(user3).borrow(actualMaxborrowAmount);

      // Reduced the price of iToken1, so user3 will have a shortfall.
      await setOraclePrices(oracle, [iToken1], [0]);

      liquidateDetails = await controller.calcAccountEquity(user3.address);
      expect(liquidateDetails[0]).to.equal(0);
      let shortfall = liquidateDetails[1];
      // console.log("shortfall", shortfall.toString());
      expect(shortfall).to.gt(0);

      // user2 is going to liquidate user3.
      let actualLiquidateAmount = rawLiquidateAmount.mul(
        ethers.BigNumber.from(10).pow(iTokenDecimals)
      );

      await iToken
        .connect(user2)
        .liquidateBorrow(user3.address, actualLiquidateAmount, iToken.address);

      liquidateDetails = await controller.calcAccountEquity(user3.address);
      shortfall = liquidateDetails[1];
      expect(shortfall).to.equal(0);

      let afterUser3iTokenBalance = await iToken.balanceOf(user3.address);
      // console.log("afterUser3iTokenBalance", afterUser3iTokenBalance.toString());
      expect(beforeUser3iTokenBalance).to.gt(afterUser3iTokenBalance);
    });
  })
});
