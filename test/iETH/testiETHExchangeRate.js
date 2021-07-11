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

describe("iETH exchange rate", async function () {
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

  describe("Test the impact of exchange rate changes during the transaction", async function () {
    it("Initialize data", async function () {
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

    it("Test supply capacity threshold", async function () {

      // Estimated iToken data after the transaction
      let data = await getiTokenCurrentData(iETH, 2);
      // Asset supply reaches the upper limit
      let totalUnderlying = data.exchangeRate.mul(data.totalSupply).div(BASE);
      // Deposit 200ETH
      let mintAmount = ethers.utils.parseEther("200");
      await controller._setSupplyCapacity(
        iETH.address,
        totalUnderlying.add(mintAmount)
      );

      let beforeBalanceOfAccount = await iETH.balanceOf(minter.address);
      let beforeBalanceOfAnother = await iETH.balanceOf(mintAnother.address);
      
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

      await controller._setSupplyCapacity(iETH.address, maxAmount);
    });

    it("Liquidation when the borrowed assets are the same as the collateral", async function () {

      // Deposit 100ETH
      let mintAmount = ethers.utils.parseEther("100");
      await expect(() =>
        iETH.connect(borrower).mint(borrower.address, { value: mintAmount })
      ).to.changeEtherBalances(
        [borrower, iETH],
        [mintAmount.mul(-1), mintAmount]
      );

      // ETH As collateral
      await controller.connect(borrower).enterMarkets([iETH.address]);

      // Maximum borrowing, creating clearing data
      let marketInfo = await controller.markets(iETH.address);
      let borrowerEquityInfo = await controller.calcAccountEquity(
        borrower.address
      );
      let borrowMaxAmount = borrowerEquityInfo[0]
        .mul(marketInfo[1])
        .div(BASE)
        .div(await oracle.getUnderlyingPrice(iETH.address));
      await expect(() =>
        iETH.connect(borrower).borrow(borrowMaxAmount)
      ).to.changeEtherBalances(
        [iETH, borrower],
        [borrowMaxAmount.mul(-1), borrowMaxAmount]
      );

      // Update interest value and create liquidation conditions
      await iETH.connect(borrower).updateInterest();
      expect((await controller.calcAccountEquity(borrower.address))[1]).to.gt(
        0
      );

      let data = await getiTokenCurrentData(iETH, 1);
      let borrowSnapshot = await iETH.borrowSnapshot(borrower.address);
      let borrowBalance = calcBorrowBalance(data.borrowIndex, borrowSnapshot);

      let repayAmount = borrowBalance.div(ethers.utils.parseUnits("2", "wei"));
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
  });
});
