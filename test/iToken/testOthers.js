const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  increaseBlock,
  getBlock,
  fixtureDefault,
} = require("../helpers/fixtures.js");

const { rmul, divup, parseTokenAmount } = require("../helpers/utils.js");

const zeroAddress = ethers.constants.AddressZero;
const BASE = ethers.utils.parseEther("1");

let iToken, iToken1, controller, interestRateModel;
let underlying, underlying1;
let users, user1, user2, user3, owner;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;

describe("iToken", function () {
  const rawMintAmount = ethers.BigNumber.from("500");

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
    [user1, user2, user3] = users;
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

  describe("Test the remaining queryable functions", function () {
    it("Query underlying balance", async function () {
      await init();
      // when exchange rate is equal to 1.(Cause no borrow)
      let totalBorrows = await iToken.totalBorrows();
      expect(totalBorrows).to.equal(0);

      let user1iTokenBalance = await iToken.balanceOf(user1.address);
      // cause do not update exchange rate, so can use the stored exchange rate.
      let currentExchangeRate = await iToken.exchangeRateStored();
      let user1Underlying1Balance = await iToken.callStatic.balanceOfUnderlying(
        user1.address
      );

      expect(user1Underlying1Balance).to.equal(
        rmul(user1iTokenBalance, currentExchangeRate)
      );

      // borrow some tokens to increase the exchange rate.
      let actualBorrowAmount = await parseTokenAmount(iToken, "100");
      await iToken.connect(user2).borrow(actualBorrowAmount);
      await increaseBlock(7545);

      currentExchangeRate = await iToken.callStatic.exchangeRateCurrent();
      user1Underlying1Balance = await iToken.callStatic.balanceOfUnderlying(
        user1.address
      );

      expect(user1Underlying1Balance).to.equal(
        rmul(user1iTokenBalance, currentExchangeRate)
      );
    });

    it("Query borrow rate block", async function () {
      // repay some tokens to accrue interest.
      let repayAmount = await parseTokenAmount(iToken, "80");
      await iToken.connect(user2).repayBorrow(repayAmount);

      let totalBorrows = await iToken.totalBorrows();
      let totalReserves = await iToken.totalReserves();
      let totalCash = await iToken.getCash();

      let ur = totalBorrows
        .mul(BASE)
        .div(totalCash.add(totalBorrows).sub(totalReserves));
      let interestPerBlock = await interestRateModel.interestPerBlock();
      let baseInterestPerBlock = await interestRateModel.baseInterestPerBlock();
      let expectBorrowRatePerBlock = ur
        .mul(interestPerBlock)
        .div(BASE)
        .add(baseInterestPerBlock);

      let borrowRatePerBlock = await iToken.borrowRatePerBlock();

      expect(borrowRatePerBlock).to.equal(expectBorrowRatePerBlock);
    });

    it("Query underlying balance", async function () {
      const actualCash = await underlying.balanceOf(iToken.address);
      const totalCash = await iToken.getCash();

      expect(actualCash).to.equal(totalCash);
    });

    it("Query the latest borrow balacne", async function () {
      let user2BeforeBorrowBalance = await iToken.borrowBalanceStored(
        user2.address
      );
      let beforeiTokenBorrowIndex = await iToken.borrowIndex();

      await iToken.borrowBalanceCurrent(user2.address);
      let user2AfterBorrowBalance = await iToken.borrowBalanceStored(
        user2.address
      );
      let afteriTokenBorrowIndex = await iToken.borrowIndex();

      expect(afteriTokenBorrowIndex).to.gt(beforeiTokenBorrowIndex);
      expect(user2AfterBorrowBalance).to.gt(user2BeforeBorrowBalance);
    });

    it("Query the borrow balance after borrow", async function () {
      // just do not want to supply and borrow the same token, so withdraw all supplying token.
      let user1BeforeSupplyBalance = await iToken.balanceOf(user1.address);
      await iToken
        .connect(user1)
        .redeem(user1.address, user1BeforeSupplyBalance);
      user1BeforeSupplyBalance = await iToken.balanceOf(user1.address);
      expect(user1BeforeSupplyBalance).to.equal(0);

      // it is the first time to borrow.
      let borrowAmout = await parseTokenAmount(iToken, 100);
      let user1BeforeBorrowBalance = await iToken.borrowSnapshot(user1.address);
      expect(user1BeforeBorrowBalance[0]).to.equal(0);

      await iToken.connect(user1).borrow(borrowAmout);
      let user1AfterBorrowBalance = await iToken.borrowSnapshot(user1.address);
      expect(user1AfterBorrowBalance[0]).to.equal(borrowAmout);

      // user1 borrows iToken .
      await increaseBlock(100);
      await iToken.connect(user1).borrow(borrowAmout);
      let user1CurrentBorrowBalance = await iToken.borrowSnapshot(
        user1.address
      );

      let expectBorrowAmount = divup(
        user1AfterBorrowBalance[0].mul(user1CurrentBorrowBalance[1]),
        user1AfterBorrowBalance[1]
      ).add(borrowAmout);
      expect(user1CurrentBorrowBalance[0]).to.equal(expectBorrowAmount);
    });

    it("Query total borrows", async function () {
      await iToken.totalBorrowsCurrent();

      let totalCash = await iToken.getCash();
      let totalBorrows = await iToken.totalBorrows();
      let totalReserves = await iToken.totalReserves();

      let borrowRate = await interestRateModel.getBorrowRate(
        totalCash,
        totalBorrows,
        totalReserves
      );

      const mineBlocks = 100;
      await increaseBlock(mineBlocks);
      let blockDelta = ethers.BigNumber.from(mineBlocks.toString());

      let simpleInterestFactor = borrowRate.mul(blockDelta);
      let interestAccumulated = simpleInterestFactor
        .mul(totalBorrows)
        .div(BASE);
      let newTotalBorrows = totalBorrows.add(interestAccumulated);

      let expectedTotalBorrows = await iToken.callStatic.totalBorrowsCurrent();

      expect(expectedTotalBorrows).to.equal(newTotalBorrows);
    });

    it("Query supply rate block", async function () {
      // when iToken totalSupply is not equal to 0
      let supplyRate = await iToken.supplyRatePerBlock();

      const underlying = (await iToken.exchangeRateStored()).mul(
        await iToken.totalSupply()
      );
      const borrowRatePerBlock = await iToken.borrowRatePerBlock();
      const totalBorrows = await iToken.totalBorrows();
      const reserveRatio = await iToken.reserveRatio();
      const expectSupplyRate = borrowRatePerBlock
        .mul(BASE.sub(reserveRatio))
        .div(BASE)
        .mul(totalBorrows.mul(BASE).mul(BASE).div(underlying))
        .div(BASE);

      expect(supplyRate).to.equal(expectSupplyRate);

      // when iToken totalSupply is equal to 0!
      await init();
      // no borrows, so exchange rate is 1e18.
      let user1iTokenbalance = await iToken.balanceOf(user1.address);
      let user2iTokenbalance = await iToken.balanceOf(user2.address);
      let user3iTokenbalance = await iToken.balanceOf(user3.address);

      await iToken.connect(user1).redeem(user1.address, user1iTokenbalance);
      await iToken.connect(user2).redeem(user2.address, user2iTokenbalance);
      // await iToken.connect(user3).redeem(user3.address, user3iTokenbalance);

      supplyRate = await iToken.supplyRatePerBlock();
      expect(supplyRate).to.equal(0);
    });
  });

  describe("Test library ERC 20", async function () {
    it("Should revert due to transfer from the zero address", async function () {
      await expect(
        underlying
          .connect(user2)
          .transferFrom(
            zeroAddress,
            user2.address,
            ethers.utils.parseUnits("1", "wei")
          )
      ).to.be.revertedWith("ERC20: transfer from the zero address");
    });

    it("Should revert due to burn from the zero address", async function () {
      await expect(
        underlying
          .connect(user2)
          .burn(zeroAddress, ethers.utils.parseUnits("1", "wei"))
      ).to.be.revertedWith("ERC20: burn from the zero address");
    });
  });
});
