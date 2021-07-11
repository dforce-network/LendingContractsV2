const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  fixtureDefault,
  getiTokenCurrentData,
} = require("../helpers/fixtures.js");

const { divup } = require("../helpers/utils.js");

const BASE = ethers.utils.parseEther("1");
const maxAmount = ethers.constants.MaxUint256;

let iToken, iToken1, iETH, controller, interestRateModel;
let underlying, underlying1;
let accounts, owner, minter, redeemer, borrower, liquidator, mintAnother;
let oracle;
let flashloanExecutor, flashloanExecutorFailure;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;

describe("iETH", async function () {
  // Initialize contract data
  async function init() {
    ({
      controller: controller,
      owner: owner,
      iToken0: iToken,
      underlying0: underlying,
      iToken1: iToken1,
      iETH: iETH,
      underlying1: underlying1,
      interestRateModel: interestRateModel,
      accounts: accounts,
      flashloanExecutor: flashloanExecutor,
      flashloanExecutorFailure: flashloanExecutorFailure,
      priceOracle: oracle,
    } = await loadFixture(fixtureDefault));

    // Set user address
    [minter, redeemer, borrower, liquidator, mintAnother] = accounts;

    // Related user assets as collateral
    await controller
      .connect(minter)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller
      .connect(borrower)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller.connect(liquidator).enterMarkets([iToken1.address]);

    // mint iToken
    let rawMintAmount = ethers.BigNumber.from("500000");
    iTokenDecimals = await iToken.decimals();
    actualiTokenMintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iTokenDecimals)
    );
    iToken1Decimals = await iToken1.decimals();
    actualiToken1MintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iToken1Decimals)
    );
    await iToken.connect(minter).mint(minter.address, actualiTokenMintAmount);
    await iToken
      .connect(borrower)
      .mint(borrower.address, actualiTokenMintAmount);
    await iToken
      .connect(liquidator)
      .mint(liquidator.address, actualiTokenMintAmount);
    await iToken1.connect(minter).mint(minter.address, actualiToken1MintAmount);
    await iToken1
      .connect(borrower)
      .mint(borrower.address, actualiToken1MintAmount);
    await iToken1
      .connect(liquidator)
      .mint(liquidator.address, actualiToken1MintAmount);
  }

  // Calculate user borrow amount
  function calcBorrowBalance(borrowIndex, borrowData) {
    let zero = ethers.utils.parseUnits("0", "wei");
    if (borrowData[0].eq(zero) || borrowData[1].eq(zero)) return zero;

    return borrowData[0]
      .mul(borrowIndex)
      .add(borrowData[1].sub(1))
      .div(borrowData[1]);
  }

  // Calculate the collateral that can be liquidated with iToken
  async function calcSeizeTokens(
    borrowiToken,
    collateralAddress,
    collateralExchangeRate,
    repayAmount
  ) {
    let liquidationIncentive = await controller.liquidationIncentiveMantissa();
    let valueRepayPlusIncentive = repayAmount
      .mul(await oracle.getUnderlyingPrice(borrowiToken.address))
      .mul(liquidationIncentive)
      .div(BASE);

    return valueRepayPlusIncentive
      .mul(BASE)
      .div(collateralExchangeRate)
      .div(await oracle.getUnderlyingPrice(collateralAddress));
  }

  describe("Test all scenarios for Mint", async function () {
    it("Initialize data and check basic minting data", async function () {
      // Initialize environments.
      await init();

      // The initial supply rate is 0
      expect(await iETH.supplyRatePerBlock()).to.equal(0);

      // Estimated iToken data after the transaction
      let data = await getiTokenCurrentData(iETH, 1);
      let beforeBalanceOf = await iETH.balanceOf(minter.address);

      // Deposit 200ETH
      let mintAmount = ethers.utils.parseEther("200");

      // Estimated amount of iETH
      let mintToken = mintAmount.mul(BASE).div(data.exchangeRate);
      await expect(() =>
        iETH.connect(minter).mint(minter.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      expect(data.cash.add(mintAmount)).to.equal(await iETH.getCash());
      expect(data.totalSupply.add(mintToken)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.add(mintToken)).to.equal(
        await iETH.balanceOf(minter.address)
      );
    });

    it("Should mint for another account", async function () {
      // Estimated iToken data after the transaction
      let data = await getiTokenCurrentData(iETH, 1);
      let beforeBalanceOfAccount = await iETH.balanceOf(minter.address);
      let beforeBalanceOfAnother = await iETH.balanceOf(mintAnother.address);

      // Deposit 200ETH
      let mintAmount = ethers.utils.parseEther("200");
      // Estimated amount of iETH
      let mintToken = mintAmount.mul(BASE).div(data.exchangeRate);

      // mint and check the amount of ETH
      await expect(() =>
        iETH.connect(minter).mint(mintAnother.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, mintAnother, iETH],
        [mintAmount.mul(-1), 0, mintAmount]
      );

      expect(data.cash.add(mintAmount)).to.equal(await iETH.getCash());
      expect(data.totalSupply.add(mintToken)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOfAccount).to.equal(
        await iETH.balanceOf(minter.address)
      );
      expect(beforeBalanceOfAnother.add(mintToken)).to.equal(
        await iETH.balanceOf(mintAnother.address)
      );
    });

    it("When the supply interest rate is greater than 0, minting operations", async function () {
      // In order to make exchange rate is greater than 1, must have a user to borrow cash and update exchange rate.
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      // Set loan amount to half of cash
      let borrowAmount = data.cash.div(ethers.utils.parseUnits("2", "wei"));

      // Borrow the ETH and check the amount of ETH
      await expect(() =>
        iETH.connect(borrower).borrow(borrowAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowAmount.mul(-1), borrowAmount]
      );

      // check iETH data
      expect(data.cash.sub(borrowAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.add(borrowAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());
      expect(await iETH.supplyRatePerBlock()).to.gte(0);

      // check borrower data
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.add(borrowAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );

      // Try to mint when exchange rate is greater than 1.
      data = await getiTokenCurrentData(iETH, 1);
      let beforeDLETHBalance = await iETH.balanceOf(minter.address);

      // mint and check the amount of ETH
      let mintAmount = ethers.utils.parseEther("23.8956");
      await expect(() =>
        iETH.connect(minter).mint(minter.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      expect(data.exchangeRate).to.equal(await iETH.exchangeRateStored());

      let expectedIncrementDLETH = mintAmount.mul(BASE).div(data.exchangeRate);
      let expectedUnderlying = expectedIncrementDLETH
        .add(beforeDLETHBalance)
        .mul(data.exchangeRate)
        .div(BASE);
      expect(beforeDLETHBalance.add(expectedIncrementDLETH)).to.equal(
        await iETH.balanceOf(minter.address)
      );
      expect(expectedUnderlying).to.equal(
        await iETH.callStatic.balanceOfUnderlying(minter.address)
      );
    });

    it("When the user supply is zero, the user will not get DLETH and will not transfer ETH", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let beforeDLETHBalance = await iETH.balanceOf(minter.address);
      let mintAmount = ethers.utils.parseEther("0");

      await expect(() =>
        iETH.connect(minter).mint(minter.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      expect(data.exchangeRate).to.equal(await iETH.exchangeRateStored());

      let expectedUnderlying = beforeDLETHBalance
        .mul(data.exchangeRate)
        .div(BASE);
      expect(beforeDLETHBalance).to.equal(await iETH.balanceOf(minter.address));
      expect(expectedUnderlying).to.equal(
        await iETH.callStatic.balanceOfUnderlying(minter.address)
      );
    });

    it("When the user provides a small amount, the user will not get DLETH, but will still transfer ETH", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let beforeDLETHBalance = await iETH.balanceOf(minter.address);
      let mintAmount = ethers.utils.parseUnits("1", "wei");

      await expect(() =>
        iETH.connect(minter).mint(minter.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      expect(data.exchangeRate).to.equal(await iETH.exchangeRateStored());

      let expectedUnderlying = beforeDLETHBalance
        .mul(data.exchangeRate)
        .div(BASE);
      expect(beforeDLETHBalance).to.equal(await iETH.balanceOf(minter.address));
      expect(expectedUnderlying).to.equal(
        await iETH.callStatic.balanceOfUnderlying(minter.address)
      );
    });

    it("Should revert due to user address is 0 address", async function () {
      await expect(
        iETH.connect(minter).mint(ethers.constants.AddressZero, {
          value: ethers.utils.parseEther("1"),
        })
      ).to.be.revertedWith("Invalid account address!");
    });

    it("Should revert due to controller refuse to mint", async function () {
      // When assets are suspended
      await controller._setMintPaused(iETH.address, true);
      await expect(
        iETH
          .connect(minter)
          .mint(minter.address, { value: ethers.utils.parseEther("1") })
      ).to.be.revertedWith("Token mint has been paused");
      await controller._setMintPaused(iETH.address, false);

      // Asset supply reaches the upper limit
      data = await getiTokenCurrentData(iETH, 2);
      await controller._setSupplyCapacity(
        iETH.address,
        data.exchangeRate
          .mul(data.totalSupply)
          .div(BASE)
          .add(ethers.utils.parseUnits("1", "wei"))
      );
      await expect(
        iETH
          .connect(minter)
          .mint(minter.address, { value: ethers.utils.parseUnits("2", "wei") })
      ).to.be.revertedWith("Token supply capacity reached");
      await controller._setSupplyCapacity(iETH.address, maxAmount);
    });
  });

  describe("Test all scenarios for Redeem", async function () {
    it("Should redeem from userself normally", async function () {
      // Need to deposit Ether before redemption
      let data = await getiTokenCurrentData(iETH, 1);
      let beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      let mintAmount = ethers.utils.parseEther("200");
      let mintToken = mintAmount.mul(BASE).div(data.exchangeRate);
      // mint and check the amount of ETH
      await expect(() =>
        iETH.connect(redeemer).mint(redeemer.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [redeemer, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      expect(data.cash.add(mintAmount)).to.equal(await iETH.getCash());
      expect(data.totalSupply.add(mintToken)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.add(mintToken)).to.equal(
        await iETH.balanceOf(redeemer.address)
      );

      // redeem.
      data = await getiTokenCurrentData(iETH, 1);
      beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      let beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);

      let redeemAmount = ethers.utils.parseEther("12.5987");
      // Estimated amount of ETH redeemed
      let redeemUnderlyingAmount = redeemAmount
        .mul(data.exchangeRate)
        .div(BASE);
      // Redeem and check the amount of ETH
      await expect(() =>
        iETH.connect(redeemer).redeem(redeemer.address, redeemAmount)
      ).to.changeEtherBalances(
        [redeemer, iETH],
        [redeemUnderlyingAmount, redeemUnderlyingAmount.mul(-1)]
      );

      expect(data.cash.sub(redeemUnderlyingAmount)).to.equal(
        await iETH.getCash()
      );
      expect(data.totalSupply.sub(redeemAmount)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.sub(redeemAmount)).to.equal(
        await iETH.balanceOf(redeemer.address)
      );
      expect(beforeBalanceOfUnderlying.sub(redeemUnderlyingAmount)).to.gte(
        await iETH.callStatic.balanceOfUnderlying(redeemer.address)
      );
      expect(data.exchangeRate).to.lte(
        await iETH.callStatic.exchangeRateCurrent()
      );

      // redeemUnderlying.
      data = await getiTokenCurrentData(iETH, 1);
      beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);

      redeemUnderlyingAmount = ethers.utils.parseEther("1.598729151");

      // Estimated amount of iETH burned
      redeemAmount = redeemUnderlyingAmount
        .mul(BASE)
        .add(data.exchangeRate.sub(ethers.utils.parseUnits("1", "wei")))
        .div(data.exchangeRate);

      // redeemUnderlying and check the amount of ETH
      await expect(() =>
        iETH
          .connect(redeemer)
          .redeemUnderlying(redeemer.address, redeemUnderlyingAmount)
      ).to.changeEtherBalances(
        [redeemer, iETH],
        [redeemUnderlyingAmount, redeemUnderlyingAmount.mul(-1)]
      );

      expect(data.cash.sub(redeemUnderlyingAmount)).to.equal(
        await iETH.getCash()
      );
      expect(data.totalSupply.sub(redeemAmount)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.sub(redeemAmount)).to.equal(
        await iETH.balanceOf(redeemer.address)
      );
      expect(beforeBalanceOfUnderlying.sub(redeemUnderlyingAmount)).to.gte(
        await iETH.callStatic.balanceOfUnderlying(redeemer.address)
      );
      expect(data.exchangeRate).to.lte(
        await iETH.callStatic.exchangeRateCurrent()
      );
    });

    it("Should redeem from another", async function () {
      let data = await getiTokenCurrentData(iETH, 2);
      let beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      let beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);

      let redeemAmount = ethers.utils.parseEther("3.1415926");
      // Estimated amount of ETH redeemed
      let redeemUnderlyingAmount = redeemAmount
        .mul(data.exchangeRate)
        .div(BASE);

      // Redemption of other accounts requires approval
      await iETH.connect(redeemer).approve(mintAnother.address, redeemAmount);
      let allowance = await iETH.allowance(
        redeemer.address,
        mintAnother.address
      );

      // Redeem and check the amount of ETH
      await expect(() =>
        iETH.connect(mintAnother).redeem(redeemer.address, redeemAmount)
      ).to.changeEtherBalances(
        [mintAnother, redeemer, iETH],
        [redeemUnderlyingAmount, 0, redeemUnderlyingAmount.mul(-1)]
      );

      expect(data.cash.sub(redeemUnderlyingAmount)).to.equal(
        await iETH.getCash()
      );
      expect(data.totalSupply.sub(redeemAmount)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.sub(redeemAmount)).to.equal(
        await iETH.balanceOf(redeemer.address)
      );
      expect(beforeBalanceOfUnderlying.sub(redeemUnderlyingAmount)).to.equal(
        await iETH.callStatic.balanceOfUnderlying(redeemer.address)
      );
      expect(data.exchangeRate).to.lte(
        await iETH.callStatic.exchangeRateCurrent()
      );
      expect(allowance.sub(redeemAmount)).to.equal(
        await iETH.allowance(mintAnother.address, mintAnother.address)
      );

      // redeemUnderlying.
      data = await getiTokenCurrentData(iETH, 2);
      beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);

      redeemUnderlyingAmount = ethers.utils.parseEther("0.008729151");

      // Estimated amount of iETH burned
      redeemAmount = redeemUnderlyingAmount
        .mul(BASE)
        .add(data.exchangeRate.sub(ethers.utils.parseUnits("1", "wei")))
        .div(data.exchangeRate);

      // Redemption of other accounts requires approval
      await iETH.connect(redeemer).approve(mintAnother.address, redeemAmount);
      allowance = await iETH.allowance(redeemer.address, mintAnother.address);

      // redeemUnderlying and check the amount of ETH
      await expect(() =>
        iETH
          .connect(mintAnother)
          .redeemUnderlying(redeemer.address, redeemUnderlyingAmount)
      ).to.changeEtherBalances(
        [mintAnother, redeemer, iETH],
        [redeemUnderlyingAmount, 0, redeemUnderlyingAmount.mul(-1)]
      );

      expect(data.cash.sub(redeemUnderlyingAmount)).to.equal(
        await iETH.getCash()
      );
      expect(data.totalSupply.sub(redeemAmount)).to.equal(
        await iETH.totalSupply()
      );
      expect(beforeBalanceOf.sub(redeemAmount)).to.equal(
        await iETH.balanceOf(redeemer.address)
      );
      expect(beforeBalanceOfUnderlying.sub(redeemUnderlyingAmount)).to.gte(
        await iETH.callStatic.balanceOfUnderlying(redeemer.address)
      );
      expect(data.exchangeRate).to.lte(
        await iETH.callStatic.exchangeRateCurrent()
      );
      expect(allowance.sub(redeemAmount)).to.equal(
        await iETH.allowance(mintAnother.address, mintAnother.address)
      );

      // approved amount is insufficient, redeem failed
      await expect(
        iETH
          .connect(mintAnother)
          .redeem(redeemer.address, ethers.utils.parseUnits("1", "wei"))
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      // approved amount is insufficient, redeemUnderlying failed
      await expect(
        iETH
          .connect(mintAnother)
          .redeemUnderlying(
            redeemer.address,
            ethers.utils.parseUnits("1", "wei")
          )
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Redeem should revert due to insufficient balance", async function () {
      let beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      await expect(
        iETH
          .connect(redeemer)
          .redeem(
            redeemer.address,
            beforeBalanceOf.add(ethers.utils.parseUnits("1", "wei"))
          )
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      let data = await getiTokenCurrentData(iETH, 1);
      let beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);
      await expect(
        iETH
          .connect(redeemer)
          .redeemUnderlying(
            redeemer.address,
            beforeBalanceOfUnderlying.add(ethers.utils.parseUnits("1", "wei"))
          )
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Redeem should revert due to redeem 0", async function () {
      await expect(
        iETH
          .connect(redeemer)
          .redeem(redeemer.address, ethers.utils.parseUnits("0", "wei"))
      ).to.be.revertedWith(
        "_redeemInternal: Redeem iToken amount should be greater than zero!"
      );

      await expect(
        iETH
          .connect(redeemer)
          .redeemUnderlying(
            redeemer.address,
            ethers.utils.parseUnits("0", "wei")
          )
      ).to.be.revertedWith(
        "_redeemInternal: Redeem iToken amount should be greater than zero!"
      );
    });

    it("Redeem should revert due to insufficient cash", async function () {
      // Other users redeem ETH, creating conditions for insufficient cash
      await iETH
        .connect(minter)
        .redeem(minter.address, await iETH.balanceOf(minter.address));
      expect(await iETH.balanceOf(minter.address)).to.equal(0);

      let data = await getiTokenCurrentData(iETH, 1);
      let beforeBalanceOf = await iETH.balanceOf(redeemer.address);
      let cash = await iETH.getCash();
      // The user's ETH is greater than cash
      expect(beforeBalanceOf.mul(data.exchangeRate).div(BASE)).to.gt(cash);

      // Redeem failed due to insufficient cash
      await expect(
        iETH.connect(redeemer).redeem(redeemer.address, beforeBalanceOf)
      ).to.be.revertedWith("reverted: function call failed to execute");

      let beforeBalanceOfUnderlying = beforeBalanceOf
        .mul(data.exchangeRate)
        .div(BASE);
      // The user's ETH is greater than cash
      expect(beforeBalanceOfUnderlying).to.gt(
        cash.add(ethers.utils.parseUnits("1", "wei"))
      );

      // Redeem underlying failed due to insufficient cash
      await expect(
        iETH
          .connect(redeemer)
          .redeemUnderlying(
            redeemer.address,
            cash.add(ethers.utils.parseUnits("1", "wei"))
          )
      ).to.be.revertedWith("reverted: function call failed to execute");
    });

    it("Should revert due to controller can not verify", async function () {
      // redeemer assets deposited in iToken
      await iToken
        .connect(redeemer)
        .mint(redeemer.address, actualiTokenMintAmount);

      // redeemer iToken as collateral
      await controller.connect(redeemer).enterMarkets([iToken.address]);

      // Calculate the maximum amount of iToken1 that redeemer can lend
      let marketInfo = await controller.markets(iToken1.address);
      let redeemerEquityInfo = await controller.calcAccountEquity(
        redeemer.address
      );
      let borrowMaxAmount = redeemerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iToken1.address));

      // redeemer loan the maximum iToken
      await expect(() =>
        iToken1.connect(redeemer).borrow(borrowMaxAmount)
      ).to.changeTokenBalances(
        underlying1,
        [iToken1, redeemer],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      // The maximum lent iToken, euqity and shortfall are all 0
      redeemerEquityInfo = await controller.calcAccountEquity(redeemer.address);
      expect(redeemerEquityInfo[0]).to.equal(0);
      expect(redeemerEquityInfo[1]).to.equal(0);
      expect(redeemerEquityInfo[2]).to.equal(redeemerEquityInfo[3]);

      // iETH no collateral
      expect(
        await controller.hasEnteredMarket(redeemer.address, iETH.address)
      ).to.equal(false);

      // When iETH is not used as collateral, the redemption is successful
      let redeemAmount = ethers.utils.parseEther("3.1415926");
      let data = await getiTokenCurrentData(iETH, 1);
      let redeemUnderlyingAmount = redeemAmount
        .mul(data.exchangeRate)
        .div(BASE);
      await expect(() =>
        iETH.connect(redeemer).redeem(redeemer.address, redeemAmount)
      ).to.changeEtherBalances(
        [redeemer, iETH],
        [redeemUnderlyingAmount, redeemUnderlyingAmount.mul(-1)]
      );

      // iETH as collateral
      await controller.connect(redeemer).enterMarkets([iETH.address]);
      expect(
        await controller.hasEnteredMarket(redeemer.address, iETH.address)
      ).to.equal(true);

      // When iETH is used as collateral, lend out all the net value
      redeemerEquityInfo = await controller.calcAccountEquity(redeemer.address);
      let borrowAmount = redeemerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iToken1.address))
        .sub(ethers.utils.parseUnits("1", "mwei"));
      expect(borrowAmount).to.gt(0);

      await expect(() =>
        iToken1.connect(redeemer).borrow(borrowAmount)
      ).to.changeTokenBalances(
        underlying1,
        [iToken1, redeemer],
        [borrowAmount.mul(-1), borrowAmount]
      );

      // euqity is 0, redeem failed
      await expect(
        iETH
          .connect(redeemer)
          .redeem(redeemer.address, await iETH.balanceOf(redeemer.address))
      ).to.be.revertedWith("Account has some shortfall");

      // euqity is 0, redeemUnderlying failed
      redeemUnderlyingAmount = await iETH.callStatic.balanceOfUnderlying(
        redeemer.address
      );
      await expect(
        iETH
          .connect(redeemer)
          .redeemUnderlying(redeemer.address, redeemUnderlyingAmount)
      ).to.be.revertedWith("Account has some shortfall");

      data = await getiTokenCurrentData(iToken1, 1);
      let borrowSnapshot = await iToken1.borrowSnapshot(redeemer.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      // Repay all the assets lent iToken1
      await expect(() =>
        iToken1.connect(redeemer).repayBorrow(maxAmount)
      ).to.changeTokenBalances(
        underlying1,
        [iToken1, redeemer],
        [borrowBalance, borrowBalance.mul(-1)]
      );

      // After the loan of iToken1 is repaid, iToken1 will no longer be used as collateral
      expect(
        await controller.hasBorrowed(redeemer.address, iToken1.address)
      ).to.equal(false);
      expect(await iToken1.borrowBalanceStored(redeemer.address)).to.equal(0);
    });
  });

  describe("Test all scenarios for Borrow", async function () {
    it("Should borrow normally", async function () {
      // Borrow the iETH.
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);

      // Lend half of the cash ETH
      let borrowAmount = data.cash.div(ethers.utils.parseUnits("2", "wei"));

      // borrow and and check the amount of ETH
      await expect(() =>
        iETH.connect(borrower).borrow(borrowAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowAmount.mul(-1), borrowAmount]
      );

      expect(data.cash.sub(borrowAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.add(borrowAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.add(borrowAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );
    });

    it("Should borrow 0 ETH", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowAmount = ethers.utils.parseUnits("0", "wei");

      // borrow 0 ETH and and check the amount of ETH
      await expect(() =>
        iETH.connect(borrower).borrow(borrowAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowAmount.mul(-1), borrowAmount]
      );

      expect(data.cash.sub(borrowAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.add(borrowAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.add(borrowAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
    });

    it("Borrow should revert due to insufficient cash", async function () {
      await expect(
        iETH
          .connect(borrower)
          .borrow(
            (await iETH.getCash()).add(ethers.utils.parseUnits("1", "wei"))
          )
      ).to.be.revertedWith("reverted: function call failed to execute");
    });

    it("Should revert due to controller refuse to borrow", async function () {
      // iETH borrow paused
      await controller._setBorrowPaused(iETH.address, true);
      await expect(
        iETH.connect(borrower).borrow(ethers.utils.parseUnits("1", "wei"))
      ).to.be.revertedWith("Token borrow has been paused");
      await controller._setBorrowPaused(iETH.address, false);

      // Beyond iETH borrow capacity
      let data = await getiTokenCurrentData(iETH, 2);
      await controller._setBorrowCapacity(iETH.address, data.totalBorrows);
      await expect(
        iETH.connect(borrower).borrow(ethers.utils.parseUnits("1", "wei"))
      ).to.be.revertedWith("Token borrow capacity reached");
      await controller._setBorrowCapacity(iETH.address, maxAmount);

      // User has shortfall, so can not borrow more.
      let marketInfo = await controller.markets(iETH.address);
      let redeemerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );
      let borrowAmount = redeemerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address));

      await expect(
        iETH.connect(borrower).borrow(borrowAmount)
      ).to.be.revertedWith("Account has some shortfall");
    });
  });

  describe("Test all scenarios for repay", async function () {
    it("Should repay for user self normally!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let repayAmount = ethers.utils.parseEther("3.1415926");

      // repay 3.1415926 ETH and and check the amount of ETH
      await expect(() =>
        iETH.connect(borrower).repayBorrow({ value: repayAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [repayAmount.mul(-1), repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect(
        await controller.hasBorrowed(borrower.address, iETH.address)
      ).to.equal(true);
    });

    it("When there is a loan, repay 0", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let repayAmount = ethers.utils.parseEther("0");

      // repay 0 ETH and and check the amount of ETH
      await expect(() =>
        iETH.connect(borrower).repayBorrow({ value: repayAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [repayAmount.mul(-1), repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
    });

    it("When the loan is 1wei after repay!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      let repayAmount = borrowBalance.sub(ethers.utils.parseUnits("1", "wei"));

      // When the repayment amount is greater than the loan amount, only the loan amount is charged to repay the loan
      await expect(() =>
        iETH.connect(borrower).repayBorrow({
          value: repayAmount,
        })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [repayAmount.mul(-1), repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect(
        await controller.hasBorrowed(borrower.address, iETH.address)
      ).to.equal(true);
    });

    it("Should pay off all loans!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      // When the repayment amount is greater than the loan amount, only the loan amount is charged to repay the loan
      await expect(() =>
        iETH.connect(borrower).repayBorrow({
          value: borrowBalance.add(ethers.utils.parseEther("1")),
        })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [borrowBalance.mul(-1), borrowBalance]
      );

      expect(data.cash.add(borrowBalance)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(borrowBalance)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());
      expect(borrowBalance.sub(borrowBalance)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect(
        await controller.hasBorrowed(borrower.address, iETH.address)
      ).to.equal(false);
    });

    it("When there is no loan, repay 0", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let repayAmount = ethers.utils.parseEther("0");
      // When the loan is 0, you can repay 0
      await expect(() =>
        iETH.connect(borrower).repayBorrow({ value: repayAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [repayAmount.mul(-1), repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
    });
  });

  describe("Test all scenarios for repay behalf", async function () {
    it("Should repay behalf for others normally!", async function () {
      // Create loan data for testing repayment
      let borrowAmount = (await iETH.getCash()).div(
        ethers.utils.parseUnits("2", "wei")
      );
      await expect(() =>
        iETH.connect(borrower).borrow(borrowAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowAmount.mul(-1), borrowAmount]
      );

      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let anotherborrowSnapshot = await iETH.borrowSnapshot(
        mintAnother.address
      );
      let repayAmount = ethers.utils.parseEther("3.1415926");

      // repayBorrowBehalf 3.1415926 ETH and and check the amount of ETH
      await expect(() =>
        iETH
          .connect(mintAnother)
          .repayBorrowBehalf(borrower.address, { value: repayAmount })
      ).to.changeEtherBalances(
        [mintAnother, borrower, iETH],
        [repayAmount.mul(-1), 0, repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect(
        await controller.hasBorrowed(borrower.address, iETH.address)
      ).to.equal(true);

      let anotherBorrowBalance = calcBorrowBalance(
        data.borrowIndex,
        anotherborrowSnapshot
      );
      expect(anotherBorrowBalance).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect((await iETH.borrowSnapshot(mintAnother.address))[0]).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect(
        await controller.hasBorrowed(mintAnother.address, iETH.address)
      ).to.equal(false);
    });

    it("When there is a loan, repay behalf 0!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let anotherborrowSnapshot = await iETH.borrowSnapshot(
        mintAnother.address
      );
      let repayAmount = ethers.utils.parseEther("0");

      // repay 0 ETH and and check the amount of ETH
      await expect(() =>
        iETH
          .connect(mintAnother)
          .repayBorrowBehalf(borrower.address, { value: repayAmount })
      ).to.changeEtherBalances(
        [mintAnother, borrower, iETH],
        [repayAmount.mul(-1), 0, repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );

      let anotherBorrowBalance = calcBorrowBalance(
        data.borrowIndex,
        anotherborrowSnapshot
      );
      expect(anotherBorrowBalance).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect((await iETH.borrowSnapshot(mintAnother.address))[0]).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
    });

    it("Should pay off all loans!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let anotherborrowSnapshot = await iETH.borrowSnapshot(
        mintAnother.address
      );
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      // When the repayment amount is greater than the loan amount, only the loan amount is charged to repay the loan
      await expect(() =>
        iETH.connect(mintAnother).repayBorrowBehalf(borrower.address, {
          value: borrowBalance.add(ethers.utils.parseEther("1")),
        })
      ).to.changeEtherBalances(
        [mintAnother, borrower, iETH],
        [borrowBalance.mul(-1), 0, borrowBalance]
      );

      expect(data.cash.add(borrowBalance)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(borrowBalance)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());
      expect(borrowBalance.sub(borrowBalance)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect(
        await controller.hasBorrowed(borrower.address, iETH.address)
      ).to.equal(false);

      let anotherBorrowBalance = calcBorrowBalance(
        data.borrowIndex,
        anotherborrowSnapshot
      );
      expect(anotherBorrowBalance).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect((await iETH.borrowSnapshot(mintAnother.address))[0]).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect(
        await controller.hasBorrowed(mintAnother.address, iETH.address)
      ).to.equal(false);
    });

    it("When there is no loan, repay behalf 0!", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let anotherborrowSnapshot = await iETH.borrowSnapshot(
        mintAnother.address
      );
      let repayAmount = ethers.utils.parseEther("0");

      // When the loan is 0, you can repay 0
      await expect(() =>
        iETH
          .connect(mintAnother)
          .repayBorrowBehalf(borrower.address, { value: repayAmount })
      ).to.changeEtherBalances(
        [mintAnother, borrower, iETH],
        [repayAmount.mul(-1), 0, repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.totalBorrows()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.borrowRate).to.lte(await iETH.borrowRatePerBlock());

      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );
      expect((await iETH.borrowSnapshot(borrower.address))[0]).to.equal(
        await iETH.borrowBalanceStored(borrower.address)
      );

      let anotherBorrowBalance = calcBorrowBalance(
        data.borrowIndex,
        anotherborrowSnapshot
      );
      expect(anotherBorrowBalance).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
      expect((await iETH.borrowSnapshot(mintAnother.address))[0]).to.equal(
        await iETH.borrowBalanceStored(mintAnother.address)
      );
    });
  });

  describe("Test all scenarios for liquidate borrow", async function () {
    it("Should liquidate normally", async function () {
      // Create loan data for testing liquidation
      let iTokenBalance = await iToken.balanceOf(borrower.address);
      let iToken1Balance = await iToken1.balanceOf(borrower.address);
      await iToken
        .connect(borrower)
        .redeem(
          borrower.address,
          iTokenBalance.sub(
            iTokenBalance.div(ethers.utils.parseUnits("20", "wei"))
          )
        );
      await iToken1
        .connect(borrower)
        .redeem(
          borrower.address,
          iToken1Balance.sub(
            iToken1Balance.div(ethers.utils.parseUnits("20", "wei"))
          )
        );

      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );
      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address));

      // Borrow to the maximum, euqity is 0
      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      //Update interest, shortfall greater than 0
      await iETH.connect(borrower).updateInterest();
      expect((await controller.calcAccountEquity(borrower.address))[1]).to.gt(
        0
      );

      let liquidatoriTokenBalance = await iToken.balanceOf(liquidator.address);
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      let repayAmount = borrowBalance.div(ethers.utils.parseUnits("10", "wei"));

      // Liquidate and check data
      await expect(() =>
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: repayAmount,
          })
      ).to.changeEtherBalances(
        [liquidator, iETH, borrower],
        [repayAmount.mul(-1), repayAmount, 0]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());

      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );

      // Check the amount of iToken obtained through liquidation
      let seizeToken = await calcSeizeTokens(
        iETH,
        iToken.address,
        await iToken.exchangeRateStored(),
        repayAmount
      );
      expect(liquidatoriTokenBalance.add(seizeToken)).to.equal(
        await iToken.balanceOf(liquidator.address)
      );
    });

    it("Should revert due to do not allow to liquidate self", async function () {
      await iETH.connect(borrower).updateInterest();

      await expect(
        iETH
          .connect(borrower)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: ethers.utils.parseUnits("10", "wei"),
          })
      ).to.be.revertedWith(
        "_liquidateBorrowInternal: Liquidator can not be borrower!"
      );
    });

    it("Should revert due to do not allow to repay 0", async function () {
      await iETH.connect(borrower).updateInterest();

      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: ethers.utils.parseUnits("0", "wei"),
          })
      ).to.be.revertedWith(
        "_liquidateBorrowInternal: Liquidate amount should be greater than 0!"
      );
    });

    it("Should revert due to controller refuses to liquidate: account does not have shortfall", async function () {
      await iETH.connect(borrower).updateInterest();

      // borrower do not have a shortfall, so controller will refuse the operation of liquidation.
      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: ethers.utils.parseUnits("1", "wei"),
          })
      ).to.be.revertedWith("Account does not have shortfall");
    });

    it("Should revert due to controller refuses to liquidate: repay exceeds max repay allowed", async function () {
      // Maximum borrowing, creating clearing data
      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );
      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address))
        .sub(ethers.utils.parseUnits("1.8", "szabo"));
      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      await iETH.connect(borrower).updateInterest();
      expect((await controller.calcAccountEquity(borrower.address))[1]).to.gt(
        0
      );

      // borrower repay exceeds max repay allowed, so controller will refuse the operation of liquidation.
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      let repayAmount = borrowBalance
        .mul(await controller.closeFactorMantissa())
        .div(BASE)
        .add(ethers.utils.parseUnits("1", "wei"));
      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: repayAmount,
          })
      ).to.be.revertedWith("Repay exceeds max repay allowed");
    });

    it("Should revert due to controller refuses to liquidate: seize has been paused", async function () {
      await controller.connect(owner)._setSeizePaused(true);
      // Seize has been paused, so controller will refuse the operation of liquidation.
      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: ethers.utils.parseUnits("1", "wei"),
          })
      ).to.be.revertedWith("Seize has been paused");
      await controller.connect(owner)._setSeizePaused(false);
    });

    it("Should revert due to controller refuses to liquidate: liquidation can be exchanged for insufficient collateral", async function () {
      // Liquidation of other collateral
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      let repayAmount = borrowBalance.div(ethers.utils.parseUnits("2", "wei"));
      let seizeToken = await calcSeizeTokens(
        iETH,
        iToken.address,
        (await getiTokenCurrentData(iToken, 1)).exchangeRate,
        repayAmount
      );
      expect(seizeToken).to.gt(await iToken.balanceOf(borrower.address));

      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: repayAmount,
          })
      ).to.be.revertedWith("SafeMath: subtraction overflow");

      // When the liquidated asset is the same as its collateral
      data = await getiTokenCurrentData(iETH, 1);
      borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      repayAmount = borrowBalance.div(ethers.utils.parseUnits("2", "wei"));
      seizeToken = await calcSeizeTokens(
        iETH,
        iETH.address,
        data.exchangeRate,
        repayAmount
      );
      expect(seizeToken).to.gt(await iETH.balanceOf(borrower.address));

      await expect(
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iETH.address, {
            value: repayAmount,
          })
      ).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    // it("Allow to repay 0, the data will not change", async function () {

    //   let data = await getiTokenCurrentData(iETH, 1);
    //   let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
    //   let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
    //   let borroweriTokenBalance = await iToken.balanceOf(borrower.address);

    //   let liquidatoriTokenBalance = await iToken.balanceOf(liquidator.address);

    //   await expect(() =>
    //     iETH.connect(liquidator).liquidateBorrow(borrower.address, iToken.address, {value: ethers.utils.parseUnits("0", "wei")})
    //   ).to.changeEtherBalances([liquidator, borrower, iETH], [0, 0, 0]);

    //   expect(data.cash).to.equal(await iETH.getCash());
    //   expect(data.totalBorrows).to.equal(await iETH.callStatic.totalBorrowsCurrent());
    //   expect(data.totalReserves).to.equal(await iETH.totalReserves());
    //   expect(data.totalSupply).to.equal(await iETH.totalSupply());
    //   expect(data.borrowRate).to.lt(await iETH.borrowRatePerBlock());

    //   expect(borrowBalance).to.equal(await iETH.callStatic.borrowBalanceCurrent(borrower.address));
    //   expect(borroweriTokenBalance).to.equal(await iToken.balanceOf(borrower.address));
    //   expect(liquidatoriTokenBalance).to.equal(await iToken.balanceOf(liquidator.address));

    //   data = await getiTokenCurrentData(iETH, 1);
    //   borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
    //   borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
    //   await expect(() =>
    //     iETH.connect(liquidator).liquidateBorrow(borrower.address, iETH.address, {value: ethers.utils.parseUnits("0", "wei")})
    //   ).to.changeEtherBalances([liquidator, borrower, iETH], [0, 0, 0]);

    //   expect(data.cash).to.equal(await iETH.getCash());
    //   expect(data.totalBorrows).to.equal(await iETH.callStatic.totalBorrowsCurrent());
    //   expect(data.totalReserves).to.equal(await iETH.totalReserves());
    //   expect(data.totalSupply).to.equal(await iETH.totalSupply());
    //   expect(data.borrowRate).to.lt(await iETH.borrowRatePerBlock());

    //   expect(borrowBalance).to.equal(await iETH.callStatic.borrowBalanceCurrent(borrower.address));
    //   expect(borroweriTokenBalance).to.equal(await iToken.balanceOf(borrower.address));
    //   expect(liquidatoriTokenBalance).to.equal(await iToken.balanceOf(liquidator.address));
    // });

    it("Liquidation when borrowed assets and collateral are not the same", async function () {
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      let repayAmount = ethers.utils.parseEther("2");
      let seizeToken = await calcSeizeTokens(
        iETH,
        iToken.address,
        (await getiTokenCurrentData(iToken, 1)).exchangeRate,
        repayAmount
      );
      expect(seizeToken).to.lte(await iToken.balanceOf(borrower.address));

      let borroweriTokenBalance = await iToken.balanceOf(borrower.address);
      let liquidatoriTokenBalance = await iToken.balanceOf(liquidator.address);

      await expect(() =>
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: repayAmount,
          })
      ).to.changeEtherBalances(
        [liquidator, borrower, iETH],
        [repayAmount.mul(-1), 0, repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.borrowRate).to.gt(await iETH.borrowRatePerBlock());

      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );
      expect(borroweriTokenBalance.sub(seizeToken)).to.equal(
        await iToken.balanceOf(borrower.address)
      );
      expect(liquidatoriTokenBalance.add(seizeToken)).to.equal(
        await iToken.balanceOf(liquidator.address)
      );
    });

    it("Liquidation when the borrowed assets are the same as the collateral", async function () {
      // Maximum borrowing, creating clearing data
      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );
      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address))
        .sub(ethers.utils.parseUnits("1", "szabo"));
      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      let mintAmount = ethers.utils.parseEther("10");
      await expect(() =>
        iETH.connect(borrower).mint(borrower.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      let repayAmount = ethers.utils.parseEther("2");
      let seizeToken = await calcSeizeTokens(
        iETH,
        iETH.address,
        data.exchangeRate,
        repayAmount
      );
      let borroweriTokenBalance = await iETH.balanceOf(borrower.address);
      expect(seizeToken).to.lte(borroweriTokenBalance);

      let liquidatoriTokenBalance = await iETH.balanceOf(liquidator.address);

      await expect(() =>
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iETH.address, {
            value: repayAmount,
          })
      ).to.changeEtherBalances(
        [liquidator, borrower, iETH],
        [repayAmount.mul(-1), 0, repayAmount]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.borrowRate).to.gt(await iETH.borrowRatePerBlock());

      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );
      expect(borroweriTokenBalance.sub(seizeToken)).to.equal(
        await iETH.balanceOf(borrower.address)
      );
      expect(liquidatoriTokenBalance.add(seizeToken)).to.equal(
        await iETH.balanceOf(liquidator.address)
      );
    });

    it("liquidate allows to repay max repayment amount - 1wei", async function () {
      // Maximum borrowing, creating clearing data
      let iToken1BalanceOfUnderlying = await iToken1.callStatic.balanceOfUnderlying(
        borrower.address
      );
      let mintiTokenAmount = iToken1BalanceOfUnderlying
        .mul(await oracle.getUnderlyingPrice(iToken1.address))
        .div(await oracle.getUnderlyingPrice(iToken.address))
        .add(ethers.utils.parseUnits("1", "ether"));

      await iToken.connect(borrower).mint(borrower.address, mintiTokenAmount);

      await controller.connect(borrower).exitMarkets([iToken1.address]);

      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );

      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address))
        .sub(ethers.utils.parseUnits("1.8", "szabo"));

      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      await iETH.connect(borrower).updateInterest();
      expect((await controller.calcAccountEquity(borrower.address))[1]).to.gt(
        0
      );

      let liquidatoriTokenBalance = await iToken.balanceOf(liquidator.address);
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      // repay max repayment amount - 1wei
      let repayAmount = borrowBalance
        .mul(await controller.closeFactorMantissa())
        .div(BASE)
        .sub(ethers.utils.parseUnits("1", "wei"));

      await expect(() =>
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iToken.address, {
            value: repayAmount,
          })
      ).to.changeEtherBalances(
        [liquidator, iETH, borrower],
        [repayAmount.mul(-1), repayAmount, 0]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());

      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );

      // Check the amount of iToken obtained through liquidation
      let seizeToken = await calcSeizeTokens(
        iETH,
        iToken.address,
        await iToken.exchangeRateStored(),
        repayAmount
      );
      expect(liquidatoriTokenBalance.add(seizeToken)).to.equal(
        await iToken.balanceOf(liquidator.address)
      );
    });

    it("liquidate allows to repay max repayment amount - 1wei the same as the collateral", async function () {
      // Maximum borrowing, creating clearing data
      let mintAmount = ethers.utils.parseEther("100");
      await expect(() =>
        iETH.connect(borrower).mint(borrower.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );

      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address))
        .sub(ethers.utils.parseUnits("0.2", "szabo"));

      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      await iETH.connect(borrower).updateInterest();
      expect((await controller.calcAccountEquity(borrower.address))[1]).to.gt(
        0
      );

      let liquidatoriETHBalance = await iETH.balanceOf(liquidator.address);
      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);
      // repay max repayment amount - 1wei
      let repayAmount = borrowBalance
        .mul(await controller.closeFactorMantissa())
        .div(BASE)
        .sub(ethers.utils.parseUnits("1", "wei"));

      await expect(() =>
        iETH
          .connect(liquidator)
          .liquidateBorrow(borrower.address, iETH.address, {
            value: repayAmount,
          })
      ).to.changeEtherBalances(
        [liquidator, iETH, borrower],
        [repayAmount.mul(-1), repayAmount, 0]
      );

      expect(data.cash.add(repayAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows.sub(repayAmount)).to.equal(
        await iETH.callStatic.totalBorrowsCurrent()
      );
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.borrowRate).to.gte(await iETH.borrowRatePerBlock());

      expect(borrowBalance.sub(repayAmount)).to.equal(
        await iETH.callStatic.borrowBalanceCurrent(borrower.address)
      );

      // Check the amount of iETH obtained through liquidation
      let seizeToken = await calcSeizeTokens(
        iETH,
        iETH.address,
        await iETH.exchangeRateStored(),
        repayAmount
      );
      expect(liquidatoriETHBalance.add(seizeToken)).to.equal(
        await iETH.balanceOf(liquidator.address)
      );
    });

    // it("Should revert due to controller refuses to liquidate: Controller mismatch between Borrowed and Collateral", async function () {
    //   let Controller = await ethers.getContractFactory("Controller");
    //   let otherController = await upgrades.deployProxy(Controller, [], {
    //     unsafeAllowCustomTypes: true,
    //     initializer: "initialize",
    //   });
    //   await iToken.connect(owner)._setController(otherController.address);
    //   // Controller mismatch between Borrowed and Collateral, so controller will refuse the operation of liquidation.
    //   await expect(
    //     iETH.connect(liquidator).liquidateBorrow(borrower.address, iToken.address, {value: ethers.utils.parseUnits("1", "wei")})
    //   ).to.be.revertedWith("Controller mismatch between Borrowed and Collateral");
    //   await iToken.connect(owner)._setController(controller.address);
    // });

    // it("Should revert due to controller refuses to liquidate: borrowed or Collateral asset price is invalid", async function () {

    //   await oracle.connect(owner)._setPaused(true);
    //   // Borrowed or Collateral asset price is invalid, so controller will refuse the operation of liquidation.
    //   await expect(
    //     iETH.connect(liquidator).liquidateBorrow(borrower.address, iToken.address, {value: ethers.utils.parseUnits("1", "wei")})
    //   ).to.be.revertedWith("Borrowed or Collateral asset price is invalid");
    //   await oracle.connect(owner)._setPaused(false);
    // });
  });

  describe("Test all scenarios for seize", async function () {
    it("Should revert due to liquidator can not be borrower", async function () {
      await expect(
        iETH
          .connect(borrower)
          .seize(
            borrower.address,
            borrower.address,
            ethers.utils.parseUnits("10", "wei")
          )
      ).to.be.revertedWith("seize: Liquidator can not be borrower!");
    });

    it("Should revert due to controller refuses to seize: Tokens have not been listed", async function () {
      await expect(
        iETH
          .connect(borrower)
          .seize(
            liquidator.address,
            borrower.address,
            ethers.utils.parseUnits("10", "wei")
          )
      ).to.be.revertedWith("Tokens have not been listed");
    });
  });

  describe.skip("Test all scenarios for Flashloan", async function () {
    it("Generate a flashloan as expected", async function () {
      let flashloanAmount = await iETH.getCash();
      let flashloanFeeAmount = (await iETH.flashloanFeeRatio())
        .mul(flashloanAmount)
        .div(BASE);
      // add enough ETH to the flashloan executor contract to repay.
      await minter.sendTransaction({
        to: flashloanExecutor.address,
        value: flashloanFeeAmount,
      });

      let data = await getiTokenCurrentData(iETH, 1);
      // execute flashloan.
      await expect(() =>
        iETH
          .connect(minter)
          .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
      ).to.changeEtherBalances(
        [minter, flashloanExecutor, iETH],
        [0, flashloanFeeAmount.mul(-1), flashloanFeeAmount]
      );

      expect(data.cash.add(flashloanFeeAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows).to.equal(await iETH.totalBorrows());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(
        data.totalReserves.add(
          flashloanFeeAmount.mul(await iETH.protocolFeeRatio()).div(BASE)
        )
      ).to.equal(await iETH.totalReserves());
      expect(data.exchangeRate).to.lt(await iETH.exchangeRateStored());
      expect(data.borrowRate).to.gt(await iETH.borrowRatePerBlock());
    });

    it("Should revert due to borrow too much cash", async function () {
      // execute flashloan.
      await expect(
        iETH
          .connect(minter)
          .flashloan(
            flashloanExecutor.address,
            (await iETH.getCash()).add(ethers.utils.parseUnits("1", "wei")),
            "0x"
          )
      ).to.be.revertedWith("reverted: function call failed to execute");
    });

    it("Should revert due to borrow too small", async function () {
      // only borrow 1 wei.
      await expect(
        iETH
          .connect(minter)
          .flashloan(
            flashloanExecutor.address,
            ethers.utils.parseUnits("1", "wei"),
            "0x"
          )
      ).to.be.revertedWith(
        "_flashloanInternal: Request amount is too small for a flashloan!"
      );

      // only borrow 0 wei.
      await expect(
        iETH
          .connect(minter)
          .flashloan(
            flashloanExecutor.address,
            ethers.utils.parseUnits("0", "wei"),
            "0x"
          )
      ).to.be.revertedWith(
        "_flashloanInternal: Request amount is too small for a flashloan!"
      );
    });

    it("Should revert due to do not repay enough", async function () {
      await expect(
        iETH
          .connect(minter)
          .flashloan(
            flashloanExecutorFailure.address,
            await iETH.getCash(),
            "0x"
          )
      ).to.be.revertedWith(
        "_flashloanInternal: Fail to repay borrow with fee!"
      );
    });

    it("Should revert due to controller refuses", async function () {
      await controller._setBorrowPaused(iETH.address, true);
      await expect(
        iETH
          .connect(minter)
          .flashloan(flashloanExecutor.address, await iETH.getCash(), "0x")
      ).to.be.revertedWith("Token borrow has been paused");
      await controller._setBorrowPaused(iETH.address, false);
    });

    it("When the protocol fee rate is 0,flashloan as expected", async function () {
      await iETH._setNewProtocolFeeRatio(ethers.utils.parseEther("0"));
      let flashloanAmount = await iETH.getCash();
      let flashloanFeeAmount = (await iETH.flashloanFeeRatio())
        .mul(flashloanAmount)
        .div(BASE);
      // add enough ETH to the flashloan executor contract to repay.
      await minter.sendTransaction({
        to: flashloanExecutor.address,
        value: flashloanFeeAmount,
      });

      let data = await getiTokenCurrentData(iETH, 1);
      // execute flashloan.
      await expect(() =>
        iETH
          .connect(minter)
          .flashloan(flashloanExecutor.address, flashloanAmount, "0x")
      ).to.changeEtherBalances(
        [minter, flashloanExecutor, iETH],
        [0, flashloanFeeAmount.mul(-1), flashloanFeeAmount]
      );

      expect(data.cash.add(flashloanFeeAmount)).to.equal(await iETH.getCash());
      expect(data.totalBorrows).to.equal(await iETH.totalBorrows());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(
        data.totalReserves.add(
          flashloanFeeAmount.mul(await iETH.protocolFeeRatio()).div(BASE)
        )
      ).to.equal(await iETH.totalReserves());
      expect(data.exchangeRate).to.lt(await iETH.exchangeRateStored());
      expect(data.borrowRate).to.gt(await iETH.borrowRatePerBlock());
      await iETH._setNewProtocolFeeRatio(ethers.utils.parseEther("0.1"));
    });

    it("Should revert due to caller is not a contract", async function () {
      await expect(
        minter.sendTransaction({
          to: iETH.address,
          value: ethers.utils.parseEther("2"),
        })
      ).to.be.revertedWith("receive: Only can call from a contract!");
    });
  });

  describe("Test all scenarios for ERC20", async function () {
    it("Should revert due to user transfer to self", async function () {
      // execute transfer.
      await expect(
        iETH
          .connect(minter)
          .transfer(minter.address, await iETH.balanceOf(minter.address))
      ).to.be.revertedWith("_transferTokens: Do not self-transfer!");
    });

    it("Should revert due to user transfer to 0 address", async function () {
      // execute transfer.
      await expect(
        iETH
          .connect(minter)
          .transfer(
            ethers.constants.AddressZero,
            await iETH.balanceOf(minter.address)
          )
      ).to.be.revertedWith("Invalid account address!");
    });

    it("Test transferFrom", async function () {
      let mintAmount = ethers.utils.parseEther("1");
      await expect(() =>
        iETH.connect(minter).mint(minter.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [minter, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      let data = await getiTokenCurrentData(iETH, 0);
      let amount = ethers.utils.parseUnits("1", "wei");
      await iETH.connect(minter).increaseAllowance(redeemer.address, amount);
      // execute transferFrom.
      await expect(() =>
        iETH
          .connect(redeemer)
          .transferFrom(minter.address, redeemer.address, amount)
      ).to.changeTokenBalances(
        iETH,
        [minter, redeemer],
        [amount.mul(-1), amount]
      );
      expect(data.cash).to.equal(await iETH.getCash());
      expect(data.totalBorrows).to.equal(await iETH.totalBorrows());
      expect(data.totalSupply).to.equal(await iETH.totalSupply());
      expect(data.totalReserves).to.equal(await iETH.totalReserves());
      expect(data.exchangeRate).to.equal(await iETH.exchangeRateStored());
      expect(data.borrowRate).to.equal(await iETH.borrowRatePerBlock());
    });

    it("Test decreaseAllowance", async function () {
      let amount = ethers.utils.parseUnits("1", "wei");
      await iETH.connect(minter).increaseAllowance(redeemer.address, amount);
      let allowance = await iETH.allowance(minter.address, redeemer.address);
      await iETH.connect(minter).decreaseAllowance(redeemer.address, amount);
      expect(allowance.sub(amount)).to.equal(
        await iETH.allowance(minter.address, redeemer.address)
      );
    });

    it("Should revert due to user approve 0 address", async function () {
      await expect(
        iETH
          .connect(minter)
          .approve(
            ethers.constants.AddressZero,
            await iETH.balanceOf(minter.address)
          )
      ).to.be.revertedWith("ERC20: approve to the zero address");
    });
  });

  describe("Test all scenarios for updateInterest", async function () {
    it("Should revert due to user transfer to self", async function () {
      // Create an unconventional interest rate model
      const MockInterestRateModel = await ethers.getContractFactory(
        "MockInterestRateModel"
      );
      const mockInterestRateModel = await MockInterestRateModel.deploy();
      await mockInterestRateModel.deployed();

      // Enable interest rate model
      await mockInterestRateModel.connect(owner).setIsInterestRateModel(true);

      // Set the iETH interest rate model to unconventional
      await iETH
        .connect(owner)
        ._setInterestRateModel(mockInterestRateModel.address);

      // execute updateInterest.
      await expect(iETH.connect(minter).updateInterest()).to.be.revertedWith(
        "_updateInterest: Borrow rate is too high!"
      );
    });
  });
});
