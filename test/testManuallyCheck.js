const { expect, util } = require("chai");
const { ethers } = require("hardhat");
const { utils, Contract } = require("ethers");
const {
  loadFixture,
  increaseBlock,
  fixtureDefault,
  getiTokenCurrentData,
  deployMSDController,
} = require("./helpers/fixtures.js");

const {
  parseTokenAmount,
  verifyAllowError,
  msdEquityPerBlock,
  setOraclePrices,
} = require("./helpers/utils.js");

const {
  executeOperations,
  getAccountBorrowData,
  getAccountSupplyData,
  getSupplyAPY,
  getBorrowAPY,
  getAllData,
} = require("./helpers/contractData.js");

const zeroAddress = ethers.constants.AddressZero;
const MAX = ethers.constants.MaxUint256;
const BASE = utils.parseEther("1");
const ZERO = ethers.BigNumber.from("0");
const blocksPerYear = ethers.BigNumber.from("2102400");

let iUSDx, iUSDT, iWBTC, iETH, controller, interestRateModel;
let USDx, USDT, WBTC;
let users, user1, user2, user3, owner;
let lendingData;
let oracle;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;
let beforeController, mockController;
let beforeInterestRateModel, mockInterestRateModel;
let delta;
let xUSD, iMUSX, xUSDS, xEUR, iMEUX, xEURS;
let msdController;
let fixedInterestRateModel;

describe("Manual Examination", function () {
  const rawMintAmount = ethers.BigNumber.from("500");

  async function init() {
    ({
      controller: controller,
      owner: owner,
      iToken0: iUSDx,
      underlying0: USDx,
      iToken1: iUSDT,
      underlying1: USDT,
      iToken2: iWBTC,
      underlying2: WBTC,
      iETH: iETH,
      interestRateModel: interestRateModel,
      accounts: users,
      flashloanExecutor: flashloanExecutor,
      flashloanExecutorFailure: flashloanExecutorFailure,
      priceOracle: oracle,
      lendingData: lendingData,
      fixedInterestRateModel: fixedInterestRateModel,
      xUSD: xUSD,
      iMUSX: iMUSX,
      xUSDS: xUSDS,
      xEUR: xEUR,
      iMEUX: iMEUX,
      xEURS: xEURS,
      msdController: msdController,
    } = await loadFixture(fixtureDefault));
    [user1, user2, user3] = users;

    iUSDxDecimals = await iUSDx.decimals();
    iUSDTDecimals = await iUSDT.decimals();
    iWBTCDecimals = await iWBTC.decimals();

    delta = 10000;

    await setOraclePrices(
      oracle,
      [iUSDx, iUSDT, iWBTC, iETH],
      [1, 1, 20000, 600]
    );
  }

  async function initialChecking(account, iUSDx, iUSDT, iWBTC) {
    let USDxIsCollateral = await controller.hasEnteredMarket(
      account,
      iUSDx.address
    );
    let USDTIsCollateral = await controller.hasEnteredMarket(
      account,
      iUSDT.address
    );
    let WBTCIsCollateral = await controller.hasEnteredMarket(
      account,
      iWBTC.address
    );
    expect(USDxIsCollateral).to.equal(false);
    expect(USDTIsCollateral).to.equal(false);
    expect(WBTCIsCollateral).to.equal(false);

    expect(await iUSDx.balanceOf(account)).to.equal(0);
    expect(await iUSDT.balanceOf(account)).to.equal(0);
    expect(await iWBTC.balanceOf(account)).to.equal(0);

    let userData = await lendingData.callStatic.getAccountTotalValueForTest(
      account
    );
    let userSupplyBalanceValue = userData[0];
    let userCollateralBalanceValue = userData[1];
    let userBorrowBalanceValue = userData[2];
    let userHealthyFactor = userData[3];

    expect(userSupplyBalanceValue).to.equal(0);
    expect(userCollateralBalanceValue).to.equal(0);
    expect(userBorrowBalanceValue).to.equal(0);
    expect(userHealthyFactor).to.equal(MAX);

    // Avaliable to borrow.
    let userEquity = await controller.calcAccountEquity(account);
    let userValidBorrowed = userEquity[0];
    expect(userValidBorrowed).to.equal(0);
  }

  async function changeFactor(newFactorConfig) {
    for (let key in newFactorConfig) {
      await controller._setCollateralFactor(
        key,
        newFactorConfig[key]["supplyFactor"]
      );
      await controller._setBorrowFactor(
        key,
        newFactorConfig[key]["borrowFactor"]
      );
      expect((await controller.markets(key))[0]).to.equal(
        newFactorConfig[key]["supplyFactor"]
      );
      expect((await controller.markets(key))[1]).to.equal(
        newFactorConfig[key]["borrowFactor"]
      );
      expect((await controller.markets(key))[2]).to.equal(
        ethers.constants.MaxUint256
      );
      expect((await controller.markets(key))[3]).to.equal(
        ethers.constants.MaxUint256
      );
    }
  }

  describe("Manual examination:", function () {
    it("01. The data of the users should be zero cause no supplys", async function () {
      await init();

      // Initialize factors of market.
      let iUSDxKey = iUSDx.address;
      let iUSDTKey = iUSDT.address;
      let iWBTCKey = iWBTC.address;

      let factorConfig = {};
      factorConfig[iUSDxKey] = {
        supplyFactor: utils.parseEther("0.75"),
        borrowFactor: utils.parseEther("1"),
      };
      factorConfig[iUSDTKey] = {
        supplyFactor: utils.parseEther("0.75"),
        borrowFactor: utils.parseEther("1"),
      };
      factorConfig[iWBTCKey] = {
        supplyFactor: utils.parseEther("0.75"),
        borrowFactor: utils.parseEther("1"),
      };
      await changeFactor(factorConfig);

      // Just initialize contract, so all data of user should be zero.
      await initialChecking(user1.address, iUSDx, iUSDT, iWBTC);
      await initialChecking(user2.address, iUSDx, iUSDT, iWBTC);
    });

    it("02. User1 supplies 1w USDx", async function () {
      let rawMintAmount = "10000";
      let actualMintAmount = await parseTokenAmount(iUSDx, rawMintAmount);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: actualMintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      // Attention!!! The value of the expectResults should be followed as following:
      // expectResults = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      // if do not want to have a check, just set it as empty.
      let expectResults = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: actualMintAmount,
          expectiTokenTotalBalanceValue: actualMintAmount,
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
          expectLiquidity: actualMintAmount,
          expectMaxAvaiableWithdrawValue: actualMintAmount,
          expectMaxSafeAvaiableWithdrawValue: actualMintAmount,
        },
        {},
        {},
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("03. User1 borrows 1 USDx", async function () {
      let rawBorrowAmount = "1";
      let actualBorrowAmount = await parseTokenAmount(iUSDx, rawBorrowAmount);

      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(0);

      // No assets as collateral, so fail to borrow.
      await expect(iUSDx.connect(user1).borrow(actualBorrowAmount)).to.reverted;
    });

    it("04. User1 borrows 1 USDT and 0.0001 WBTC", async function () {
      let rawBorrowUSDTAmount = "1";
      let rawBorrowWBTCAmount = "0.0001";
      let actualBorrowUSDTAmount = await parseTokenAmount(
        iUSDT,
        rawBorrowUSDTAmount
      );
      let actualBorrowWBTCAmount = await parseTokenAmount(
        iUSDT,
        rawBorrowWBTCAmount
      );

      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(0);

      // No assets as collateral, so fail to borrow.
      await expect(iUSDT.connect(user1).borrow(actualBorrowUSDTAmount)).to
        .reverted;
      await expect(iWBTC.connect(user1).borrow(actualBorrowWBTCAmount)).to
        .reverted;

      // No mint, so liquidity is 0.
      const USDTLiquidity = await iUSDT.getCash();
      expect(USDTLiquidity).to.equal(0);
      const WBTCLiquidity = await iWBTC.getCash();
      expect(WBTCLiquidity).to.equal(0);
    });

    it("05. User1 withdraws 1000 USDx", async function () {
      let rawWithdrawAmount = "1000";
      let actualWithdrawAmount = await parseTokenAmount(
        iUSDx,
        rawWithdrawAmount
      );

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: actualWithdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      let expectCommonValue = await parseTokenAmount(iUSDx, "9000");
      let expectResults = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: expectCommonValue,
          expectiTokenTotalBalanceValue: expectCommonValue,
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
          expectLiquidity: expectCommonValue,
          expectMaxAvaiableWithdrawValue: expectCommonValue,
          expectMaxSafeAvaiableWithdrawValue: expectCommonValue,
        },
        {},
        {},
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("06. User1 withdraws all remaining USDx", async function () {
      let withdrawMaxAmount = await iUSDx.balanceOf(user1.address);

      let caseDetails = [
        {
          user: user1,
          action: "redeem",
          asset: iUSDx,
          underlying: USDx,
          amount: withdrawMaxAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      let expectResults = [
        {
          user: user1,
          action: "redeem",
          asset: iUSDx,
          amount: withdrawMaxAmount,
          isStableCoin: true,
          expectiTokenBalance: ZERO,
          expectiTokenTotalBalanceValue: ZERO,
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
          expectLiquidity: ZERO,
          expectMaxAvaiableWithdrawValue: ZERO,
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {},
        {},
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("07. User1 supplies 1w USDx and use it as collateral", async function () {
      let rawMintAmount = "10000";
      let actualMintAmount = await parseTokenAmount(iUSDx, rawMintAmount);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: actualMintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      let expectResults = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          amount: actualMintAmount,
          isStableCoin: true,
          expectiTokenBalance: actualMintAmount,
          expectiTokenTotalBalanceValue: actualMintAmount,
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
          expectLiquidity: actualMintAmount,
          expectMaxAvaiableWithdrawValue: actualMintAmount,
          expectMaxSafeAvaiableWithdrawValue: actualMintAmount,
        },
        {},
        {},
      ];

      await executeOperations(caseDetails, expectResults);

      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(0);

      await controller.connect(user1).enterMarkets([iUSDx.address]);
      enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(1);
    });

    it("08. User1 borrows 1k USDT and 0.05 WBTC", async function () {
      let rawBorrowUSDTAmount = "1000";
      let actualBorrowUSDTAmount = await parseTokenAmount(
        iUSDT,
        rawBorrowUSDTAmount
      );
      let rawBorrowWBTCAmount = "0.05";
      let actualBorrowWBTCAmount = await parseTokenAmount(
        iWBTC,
        rawBorrowWBTCAmount
      );

      // cause there is no cash for USDT and WBTC, so user can not borrow them.
      await expect(iUSDT.connect(user1).borrow(actualBorrowUSDTAmount)).to
        .reverted;
      await expect(iWBTC.connect(user1).borrow(actualBorrowWBTCAmount)).to
        .reverted;
    });

    it("09. User2 supplies 1w USDT", async function () {
      let rawMintAmount = "10000";
      let actualMintAmount = await parseTokenAmount(iUSDT, rawMintAmount);

      let caseDetails = [
        {
          user: user2,
          action: "mint",
          asset: iUSDT,
          underlying: USDT,
          amount: actualMintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      let expectResults = [
        {
          user: user2,
          asset: iUSDT,
          amount: actualMintAmount,
          isStableCoin: true,
          expectiTokenBalance: actualMintAmount,
          expectiTokenTotalBalanceValue: actualMintAmount.mul(
            ethers.BigNumber.from("10").pow("12")
          ),
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
          expectLiquidity: actualMintAmount,
          expectMaxAvaiableWithdrawValue: actualMintAmount,
          expectMaxSafeAvaiableWithdrawValue: actualMintAmount,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: ZERO,
          expectiTokenBorrowedBalanceValue: ZERO,
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "7500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "6000"),
          expectLiquidity: actualMintAmount,
        },
        {},
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("10. User1 borrows 1k USDT", async function () {
      let rawBorrowAmount = "1000";
      let actualBorrowAmount = await parseTokenAmount(iUSDT, rawBorrowAmount);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iUSDT,
          underlying: USDT,
          amount: actualBorrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
        },
      ];

      const commonVaule = await parseTokenAmount(iUSDx, "10000");
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: commonVaule,
          expectiTokenTotalBalanceValue: commonVaule,
          expectCollateralBalanceValue: commonVaule,
          expectHealthyFactor: await parseTokenAmount(iUSDx, "7.500"),
          expectLiquidity: commonVaule,
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "8666.666666666666666666"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "8333.333333333333333333"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "1000"),
          // in order to match commom data.(scaled by 1e18)
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "1000"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "6500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "5000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "9000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "0"),
          expectHealthyFactor: MAX,
        },
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("11. Decrease the collateral factor of the USDx to 0%", async function () {
      let usdxOldCollateralFactor = (
        await controller.markets(iUSDx.address)
      )[0];
      expect(usdxOldCollateralFactor).to.not.equal(0);

      let allDataOfUser1ForUSDx = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iUSDx,
        "true",
        ethers.utils.parseEther("1")
      );
      expect(allDataOfUser1ForUSDx.availableToWithdraw).to.not.equal("0");
      expect(allDataOfUser1ForUSDx.safeAvailableToWithdraw).to.not.equal("0");

      await controller._setCollateralFactor(iUSDx.address, "0");
      let usdxNewCollateralFactor = (
        await controller.markets(iUSDx.address)
      )[0];
      expect(usdxNewCollateralFactor).to.not.equal(1);

      allDataOfUser1ForUSDx = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iUSDx,
        "true",
        ethers.utils.parseEther("1")
      );

      expect(allDataOfUser1ForUSDx.totalSupply).to.equal(
        ethers.utils.parseEther("10000")
      );
      expect(allDataOfUser1ForUSDx.supplyBalanceValue).to.equal(
        ethers.utils.parseEther("10000")
      );
      expect(allDataOfUser1ForUSDx.collateralBalanceValue).to.equal(
        ethers.utils.parseEther("0")
      );
      expect(allDataOfUser1ForUSDx.healthyFactor).to.equal(
        ethers.utils.parseEther("0")
      );
      expect(allDataOfUser1ForUSDx.availableToWithdraw).to.equal("0");
      expect(allDataOfUser1ForUSDx.safeAvailableToWithdraw).to.equal("0");

      let allDataOfUser1ForUSDT = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iUSDT,
        "true",
        ethers.utils.parseEther("1")
      );
      expect(Number(allDataOfUser1ForUSDT.borrowBalance.toString())).to.closeTo(
        Number(await parseTokenAmount(iUSDT, "1000")),
        delta
      );
      expect(
        Number(allDataOfUser1ForUSDT.borrowBalanceValue.toString())
      ).to.closeTo(
        Number(ethers.utils.parseEther("1000").toString()),
        delta * 10 ** 12
      ); // only for usdt

      expect(allDataOfUser1ForUSDT.availableBorrow).to.equal("0");
      expect(allDataOfUser1ForUSDT.safeAvailableToBorrow).to.equal("0");

      let allDataOfUser2ForUSDT = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDT,
        "true",
        ethers.utils.parseEther("1")
      );
      expect(allDataOfUser2ForUSDT.totalSupply).to.equal(
        await parseTokenAmount(iUSDT, "10000")
      );
      expect(
        Number(allDataOfUser2ForUSDT.supplyBalanceValue.toString())
      ).to.closeTo(Number(await parseTokenAmount(iUSDT, "10000")), delta);
      expect(allDataOfUser2ForUSDT.collateralBalanceValue).to.equal(
        ethers.utils.parseEther("0")
      );
      expect(allDataOfUser2ForUSDT.healthyFactor).to.equal(MAX);
    });

    it("12. Borrow MAX USDT will fail, cause collateral factor is 0 now", async function () {
      await expect(
        iUSDT.connect(user1).borrow(ethers.utils.parseEther("6500"))
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("13. Withdraw 1000 USDx will fail, cause collateral factor is 0 now", async function () {
      await expect(
        iUSDx
          .connect(user1)
          .redeem(user1.address, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("Account has some shortfall");

      await expect(
        iUSDx
          .connect(user1)
          .redeemUnderlying(user1.address, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("14. Set the collateral factor of USDx to 75%, and then borrow max amount of USDT", async function () {
      let newCollateralFactor = ethers.utils.parseEther("0.75");
      await controller._setCollateralFactor(iUSDx.address, newCollateralFactor);
      let usdxCurrentCollateralFactor = (
        await controller.markets(iUSDx.address)
      )[0];
      expect(usdxCurrentCollateralFactor).to.equal(newCollateralFactor);

      let maxBorrowAmount = await parseTokenAmount(iUSDT, "6499.999969");
      let oldBorrowAmount = await parseTokenAmount(iUSDT, "1000");
      let totalBorrowAmount = maxBorrowAmount.add(oldBorrowAmount);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iUSDT,
          underlying: USDT,
          amount: maxBorrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
        },
      ];

      const commonVaule = await parseTokenAmount(iUSDx, "10000");
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: commonVaule,
          expectiTokenTotalBalanceValue: commonVaule,
          expectCollateralBalanceValue: commonVaule,
          expectHealthyFactor: BASE.add(ethers.BigNumber.from("133333000")), // extra interest.
          expectLiquidity: commonVaule,
          expectMaxAvaiableWithdrawValue: ethers.BigNumber.from(ZERO), // extra interest.
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: totalBorrowAmount,
          // in order to match commom data.(scaled by 1e18)
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "7499.999999"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "2500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
        },
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("15. User1 withdraws 1k USDx", async function () {
      await expect(
        iUSDx
          .connect(user1)
          .redeemUnderlying(user1.address, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("16. User1 repays 1k USDT", async function () {
      let repayAmount = await parseTokenAmount(iUSDT, "1000");
      let caseDetails = [
        {
          user: user1,
          action: "repay",
          asset: iUSDT,
          underlying: USDT,
          amount: repayAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
        },
      ];

      const commonVaule = await parseTokenAmount(iUSDx, "10000");
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: commonVaule,
          expectiTokenTotalBalanceValue: commonVaule,
          expectCollateralBalanceValue: commonVaule,
          expectHealthyFactor: await parseTokenAmount(
            iUSDx,
            "1.153846052840245000"
          ), // extra interest.
          expectLiquidity: commonVaule,
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "1333.332574666666"
          ), // extra interest.
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          // in order to match commom data.(scaled by 1e18)
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "6500.000569"
          ), // extra interest.
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1000"),
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "3500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
        },
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("17. User1 withdraws 1k USDx", async function () {
      let withdrawAmount = await parseTokenAmount(iUSDx, "1000");

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      const commonVaule = await parseTokenAmount(iUSDx, "9000");
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: commonVaule,
          expectiTokenTotalBalanceValue: commonVaule,
          expectCollateralBalanceValue: commonVaule,
          expectHealthyFactor: await parseTokenAmount(
            iUSDx,
            "1.0384614133668000"
          ), // extra interest.
          expectLiquidity: commonVaule,
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "333.332574666666"
          ), // extra interest.
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          // in order to match commom data.(scaled by 1e18)
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "6500.000783"
          ), // extra interest.
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "249.999"),
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "3500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: ZERO,
          expectHealthyFactor: MAX,
        },
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("18. User1 fails to close USDx as collateral, cause it is used as collateral to borrow", async function () {
      await expect(
        controller.connect(user1).exitMarkets([iUSDx.address])
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("19. User1 withdraws max amount of USDx", async function () {
      let withdrawAmount = await parseTokenAmount(iUSDx, "333.33");
      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "8666.67"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1.0000001981538"),
          expectLiquidity: await parseTokenAmount(iUSDx, "8666.67"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "0.002572"
          ),
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "6500.001212"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "3500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "0"),
          expectHealthyFactor: MAX,
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("20. User1 supplies 0.5 WBTC", async function () {
      let mintAmount = await parseTokenAmount(iWBTC, "0.5");
      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iWBTC,
          underlying: WBTC,
          amount: mintAmount,
          isStableCoin: false,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iWBTC,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iWBTC, "0.5"),
          // for common type, scaled 1e18
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.67000000000399"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1.0000001652307"),
          expectLiquidity: await parseTokenAmount(iWBTC, "0.5"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(iWBTC, "0.5"),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iWBTC,
            "0.5"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "6500.001426"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "3500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "0"),
          expectHealthyFactor: MAX,
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("21. User1 fails to borrow 1 USDT", async function () {
      await expect(
        iUSDT.connect(user1).borrow(await parseTokenAmount(iUSDT, "1"))
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("22. User2 set USDT as collateral", async function () {
      let delta = 100000;
      let enterMarkets = await controller.getEnteredMarkets(user2.address);
      expect(enterMarkets.length).to.equal(0);

      await controller.connect(user2).enterMarkets([iUSDT.address]);
      enterMarkets = await controller.getEnteredMarkets(user2.address);
      expect(enterMarkets.length).to.equal(1);

      let allDataOfUser2ForUSDT = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDT,
        "true",
        ethers.utils.parseEther("0.8")
      );
      expect(
        Number(allDataOfUser2ForUSDT.collateralBalanceValue.toString())
      ).to.closeTo(
        Number((await parseTokenAmount(iUSDx, "10000.001746")).toString()),
        delta
      );

      let allDataOfUser2ForUSDx = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDx,
        "true",
        ethers.utils.parseEther("0.8")
      );

      expect(
        Number(allDataOfUser2ForUSDx.availableBorrow.toString())
      ).to.closeTo(
        Number((await parseTokenAmount(iUSDx, "7500.000417")).toString()),
        delta
      );
      expect(
        Number(allDataOfUser2ForUSDx.safeAvailableToBorrow.toString())
      ).to.closeTo(
        Number((await parseTokenAmount(iUSDx, "6000.0003336")).toString()),
        delta
      );

      let allDataOfUser2ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iWBTC,
        "true",
        ethers.utils.parseEther("0.8")
      );

      expect(
        Number(allDataOfUser2ForWBTC.availableBorrow.toString())
      ).to.closeTo(
        Number((await parseTokenAmount(iWBTC, "0.375")).toString()),
        delta
      );
      expect(
        Number(allDataOfUser2ForWBTC.safeAvailableToBorrow.toString())
      ).to.closeTo(
        Number((await parseTokenAmount(iWBTC, "0.3")).toString()),
        delta
      );
    });

    it("23. User2 borrows 500 USDT", async function () {
      let borrowAmount = await parseTokenAmount(iUSDT, "500");
      let caseDetails = [
        {
          user: user2,
          action: "borrow",
          asset: iUSDT,
          underlying: USDT,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          // for common type, scaled 1e18
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.001944"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(iUSDT, "3000"),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDT,
            "3000"
          ),
        },
        {},
        {},
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForUSDx = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDx,
        "true",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(
        allDataOfUser2ForUSDx.availableBorrow,
        await parseTokenAmount(iUSDx, "7000"),
        delta
      );
      verifyAllowError(
        allDataOfUser2ForUSDx.safeAvailableToBorrow,
        await parseTokenAmount(iUSDx, "5500"),
        delta
      );
    });

    it("24. User1 sets WBTC as collateral", async function () {
      let enterMarkets = await controller.getEnteredMarkets(user2.address);
      expect(enterMarkets.length).to.equal(1);

      await controller.connect(user1).enterMarkets([iWBTC.address]);
      enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(2);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "8666.67"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.67"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.67"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.153845776331"),
          expectLiquidity: await parseTokenAmount(iUSDx, "8666.67"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "7833.326"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "6500.001212"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "3000"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "3000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("24.1 User1 closes USDx as collateral", async function () {
      await controller.connect(user1).exitMarkets([iUSDx.address]);

      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(1);
    });

    it("24.2 User1 sets USDx as collateral", async function () {
      await controller.connect(user1).enterMarkets([iUSDx.address]);
      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(2);
    });

    it("25. User1 repays 3.5k USDT", async function () {
      let repayAmount = await parseTokenAmount(iUSDT, "3500");
      let caseDetails = [
        {
          user: user1,
          action: "repay",
          asset: iUSDT,
          underlying: USDT,
          amount: repayAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
        },
      ];

      const commonVaule = await parseTokenAmount(iUSDx, "8666.666666");
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: commonVaule,
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.666666"
          ), // including wbtc
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.666666"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "4.66666356"),
          expectLiquidity: commonVaule,
          expectMaxAvaiableWithdrawValue: commonVaule,
          expectMaxSafeAvaiableWithdrawValue: commonVaule,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          // in order to match commom data.(scaled by 1e18)
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "3000"
          ), // extra interest.
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "6500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "6500"),
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];

      await executeOperations(caseDetails, expectResults);
    });

    it("26. User1 closes USDx as collateral", async function () {
      await controller.connect(user1).exitMarkets([iUSDx.address]);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "8666.67"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "18666.67"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(
            iUSDx,
            "2.499997846668522"
          ),
          expectLiquidity: await parseTokenAmount(iUSDx, "8666.67"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "8666.67"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "3000"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "4500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "3000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("27. User1 withdraws 1k USDx", async function () {
      let withdrawAmount = await parseTokenAmount(iUSDx, "1000");
      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "7666.67"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDx,
            "17666.67"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(
            iUSDx,
            "2.499997846668522"
          ),
          expectLiquidity: await parseTokenAmount(iUSDx, "7666.67"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "7666.67"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "7666.67"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "3000"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "4500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "3000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("28. User1 withdraws max amount of USDx", async function () {
      let maxWithdrawAmount = await parseTokenAmount(iUSDx, "7666.67");
      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: maxWithdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: ZERO,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.4999977583353"),
          expectLiquidity: ZERO,
          expectMaxAvaiableWithdrawValue: ZERO,
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "3000"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "4500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "3000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForUSDx = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDx,
        "true",
        ethers.utils.parseEther("0.8")
      );

      expect(allDataOfUser2ForUSDx.availableBorrow).to.equal(ZERO);
      expect(allDataOfUser2ForUSDx.safeAvailableToBorrow).to.equal(ZERO);
    });

    it("29. User2 supplies 50 ETH", async function () {
      let mixMintAmount = await parseTokenAmount(iETH, "50");
      let caseDetails = [
        {
          user: user2,
          action: "mint",
          asset: iETH,
          underlying: zeroAddress,
          amount: mixMintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user2,
          asset: iETH,
          isStableCoin: true,
          expectiTokenBalance: mixMintAmount,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "40000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15.00000182"),
          expectLiquidity: mixMintAmount,
          expectMaxAvaiableWithdrawValue: mixMintAmount,
          expectMaxSafeAvaiableWithdrawValue: mixMintAmount,
        },
        {
          user: user1,
          asset: iETH,
          isStableCoin: false,
          expectiTokenBorrowedBalance: ZERO,
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iETH,
            "3000"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iETH, "7.5"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iETH, "5"),
          expectLiquidity: await parseTokenAmount(iETH, "50"),
        },
        {},
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("30. User1 borrows 7.5 ETH", async function () {
      let borrowAmount = await parseTokenAmount(iETH, "7.49999");
      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: borrowAmount,
          isStableCoin: false,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: ZERO,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1"),
          expectLiquidity: ZERO,
          expectMaxAvaiableWithdrawValue: ZERO,
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "7500"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(
        allDataOfUser2ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0"),
        delta
      );
      verifyAllowError(
        allDataOfUser2ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0"),
        delta
      );
    });

    it("31. Set the price of WBTC to $30000", async function () {
      await setOraclePrices(oracle, [iWBTC], [30000]);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: ZERO,
          isStableCoin: false,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iWBTC,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iWBTC, "0.5"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "15000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "15000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1.5"),
          expectLiquidity: await parseTokenAmount(iWBTC, "0.5"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iWBTC,
            "0.1666668"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iWBTC,
            "0.0833335"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "7500"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "3750"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1500.003"),
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {},
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(
        allDataOfUser2ForETH.availableBorrow,
        await parseTokenAmount(iETH, "6.25"),
        delta
      );
      verifyAllowError(
        allDataOfUser2ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "2.5"),
        delta
      );
    });

    it("32. User1 fails to borrow 7 ETH", async function () {
      await expect(
        iETH.connect(user1).borrow(await parseTokenAmount(iETH, "7"))
      ).to.revertedWith("Account has some shortfall");
    });

    it("33. User1 borrow 6.25 ETH", async function () {
      let borrowAmount = await parseTokenAmount(iETH, "6.25");
      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: borrowAmount,
          isStableCoin: false,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iWBTC,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iWBTC, "0.5"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "15000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "15000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1.0000002536"),
          expectLiquidity: await parseTokenAmount(iWBTC, "0.5"),
          expectMaxAvaiableWithdrawValue: ZERO,
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iETH,
          isStableCoin: false,
          expectiTokenBorrowedBalance: await parseTokenAmount(iETH, "13.75"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iETH,
            "11250"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iETH, "0.00000478"),
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iETH, "36.25"),
        },
        {},
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iUSDT,
        "false",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(allDataOfUser2ForETH.availableBorrow, ZERO, delta);
      verifyAllowError(allDataOfUser2ForETH.safeAvailableToBorrow, ZERO, delta);
    });

    it("34. Set the price of WBTC to $20000", async function () {
      await setOraclePrices(oracle, [iWBTC], [20000]);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iETH,
          underlying: zeroAddress,
          amount: ZERO,
          isStableCoin: false,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iWBTC,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iWBTC, "0.5"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "0.66666681581"),
          expectLiquidity: await parseTokenAmount(iWBTC, "0.5"),
          expectMaxAvaiableWithdrawValue: ZERO,
          expectMaxSafeAvaiableWithdrawValue: ZERO,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "11250"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {},
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(allDataOfUser1ForETH.availableBorrow, ZERO, delta);
      verifyAllowError(allDataOfUser1ForETH.safeAvailableToBorrow, ZERO, delta);
    });

    it("35. User1 fails to withdraw 0.3 WBTC", async function () {
      await expect(
        iWBTC
          .connect(user1)
          .redeemUnderlying(user1.address, await parseTokenAmount(iWBTC, "0.3"))
      ).to.revertedWith("Account has some shortfall");
    });

    it("36. User1 supplies 1w USDx", async function () {
      let mintAmount = await parseTokenAmount(iUSDx, "10000");
      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: mintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: mintAmount,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "20000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "0.666666795"),
          expectLiquidity: mintAmount,
          expectMaxAvaiableWithdrawValue: mintAmount,
          expectMaxSafeAvaiableWithdrawValue: mintAmount,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "11250"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let allDataOfUser2ForUSDT = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iUSDT,
        "true",
        ethers.utils.parseEther("0.8")
      );

      let delta = 0.00001;
      verifyAllowError(
        allDataOfUser2ForUSDT.availableBorrow,
        await parseTokenAmount(iUSDT, "6500"),
        delta
      );
      verifyAllowError(
        allDataOfUser2ForUSDT.safeAvailableToBorrow,
        await parseTokenAmount(iUSDT, "5500"),
        delta
      );

      let allDataOfUser2ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user2.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser2ForWBTC.availableBorrow,
        await parseTokenAmount(iWBTC, "0.35"),
        delta
      );
      verifyAllowError(
        allDataOfUser2ForWBTC.safeAvailableToBorrow,
        await parseTokenAmount(iWBTC, "0.275"),
        delta
      );
    });

    it("37. Set USDx supply cap to 1k", async function () {
      let marketData = await controller.markets(iUSDx.address);
      expect(marketData.supplyCapacity).to.equal(MAX);

      let newSupplyCapacity = await parseTokenAmount(iUSDx, "1000");
      await controller._setSupplyCapacity(iUSDx.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDx.address);
      expect(marketData.supplyCapacity).to.equal(newSupplyCapacity);
    });

    it("38. Set USDx supply cap to 3w", async function () {
      let newSupplyCapacity = await parseTokenAmount(iUSDx, "30000");
      await controller._setSupplyCapacity(iUSDx.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDx.address);
      expect(marketData.supplyCapacity).to.equal(newSupplyCapacity);
    });

    it("39. User1 supplies 1w USDx", async function () {
      let mintAmount = await parseTokenAmount(iUSDx, "10000");
      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: mintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      let totalUSDxSupplied = await parseTokenAmount(iUSDx, "20000");
      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: totalUSDxSupplied,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "30000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "0.666666795"),
          expectLiquidity: totalUSDxSupplied,
          expectMaxAvaiableWithdrawValue: totalUSDxSupplied,
          expectMaxSafeAvaiableWithdrawValue: totalUSDxSupplied,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "11250"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("40. User1 supplies another 1w USDx to attain supply capacity", async function () {
      let mintAmount = await parseTokenAmount(iUSDx, "10000");
      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: mintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      let totalUSDxSupplied = await parseTokenAmount(iUSDx, "30000");
      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: totalUSDxSupplied,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "40000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "0.666666795"),
          expectLiquidity: totalUSDxSupplied,
          expectMaxAvaiableWithdrawValue: totalUSDxSupplied,
          expectMaxSafeAvaiableWithdrawValue: totalUSDxSupplied,
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "3000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "11250"
          ),
          expectMaxAvaiableBorrow: ZERO,
          expectSafeAvaiableBorrow: ZERO,
          expectLiquidity: await parseTokenAmount(iUSDT, "6500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("41. User1 fails to supply another 1 USDx, cause has attained the supply capacity", async function () {
      //
      await expect(
        iUSDx
          .connect(user1)
          .mint(user1.address, await parseTokenAmount(iUSDx, "1"))
      ).to.be.revertedWith("Token supply capacity reached");
    });

    it("42. Sets USDT supply cap to 1w", async function () {
      let marketData = await controller.markets(iUSDT.address);
      expect(marketData.supplyCapacity).to.equal(MAX);

      let newSupplyCapacity = await parseTokenAmount(iUSDT, "10000");
      await controller._setSupplyCapacity(iUSDT.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDT.address);
      expect(marketData.supplyCapacity).to.equal(newSupplyCapacity);
    });

    it("43. User2 liquidates User1", async function () {
      let liquidateAmount = await parseTokenAmount(iUSDT, "1000");

      await expect(() =>
        iUSDT
          .connect(user2)
          .liquidateBorrow(user1.address, liquidateAmount, iWBTC.address)
      ).to.changeTokenBalance(
        iWBTC,
        user2,
        await parseTokenAmount(iWBTC, "0.055")
      );

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      let usdxLiquidity = await parseTokenAmount(iUSDx, "30000");
      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: usdxLiquidity,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "8900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "0.65121959"),
          expectLiquidity: usdxLiquidity,
          expectMaxAvaiableWithdrawValue: usdxLiquidity,
          expectMaxSafeAvaiableWithdrawValue: usdxLiquidity,
        },
        {},
        {},
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("44. Sets USDT borrow cap to 1k", async function () {
      let marketData = await controller.markets(iUSDT.address);
      expect(marketData.borrowCapacity).to.equal(MAX);

      let newSupplyCapacity = await parseTokenAmount(iUSDT, "1000");
      await controller._setBorrowCapacity(iUSDT.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDT.address);
      expect(marketData.borrowCapacity).to.equal(newSupplyCapacity);
    });

    it("45. Sets USDT borrow cap to 1w", async function () {
      let newSupplyCapacity = await parseTokenAmount(iUSDT, "10000");
      await controller._setBorrowCapacity(iUSDT.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDT.address);
      expect(marketData.borrowCapacity).to.equal(newSupplyCapacity);
    });

    it("46. User1 borrows 1k USDT", async function () {
      let borrowAmount = await parseTokenAmount(iUSDT, "1000");
      await expect(
        iUSDT.connect(user1).borrow(borrowAmount)
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("47. User1 sets USDx as collateral", async function () {
      let enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(1);

      await controller.connect(user1).enterMarkets([iUSDx.address]);
      enterMarkets = await controller.getEnteredMarkets(user1.address);
      expect(enterMarkets.length).to.equal(2);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      let totalUSDxSupplied = await parseTokenAmount(iUSDx, "30000");
      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: totalUSDxSupplied,
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.8463416"),
          expectLiquidity: totalUSDxSupplied,
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "25233.336556"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "21816.670645"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "2000"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "10250"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "7500"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "7500"),
          expectLiquidity: await parseTokenAmount(iUSDT, "7500"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;

      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "31.5416"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "21.81666"),
        delta
      );
    });

    it("48. User1 borrows 1k USDT", async function () {
      let borrowAmount = await parseTokenAmount(iUSDT, "1000");

      await expect(() =>
        iUSDT.connect(user1).borrow(borrowAmount)
      ).to.changeTokenBalance(USDT, user1, borrowAmount);

      let delta = 0.00001;
      let user1USDTTotalBorrowAmmount = await iUSDT.borrowBalanceStored(
        user1.address
      );
      let user1ETHTotalBorrowAmmount = await iETH.borrowBalanceStored(
        user1.address
      );
      let user2USDTTotalBorrowAmmount = await iUSDT.borrowBalanceStored(
        user2.address
      );

      verifyAllowError(
        user1USDTTotalBorrowAmmount,
        await parseTokenAmount(iUSDT, "3000"),
        delta
      );
      verifyAllowError(
        user1ETHTotalBorrowAmmount,
        await parseTokenAmount(iETH, "13.75"),
        delta
      );
      verifyAllowError(
        user2USDTTotalBorrowAmmount,
        await parseTokenAmount(iUSDT, "500"),
        delta
      );

      verifyAllowError(
        await iUSDT.getCash(),
        await parseTokenAmount(iUSDT, "6500"),
        delta
      );
    });

    it("49. User1 borrows 5.5k USDT", async function () {
      let borrowAmount = await parseTokenAmount(iUSDT, "5500");

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iUSDT,
          underlying: USDT,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "30000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "1.741791"),
          expectLiquidity: await parseTokenAmount(iUSDx, "30000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "16566.6696"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "10983.3370133"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "8500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16750"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1000"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "1000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;

      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableBorrow,
        await parseTokenAmount(iETH, "20.708333"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "10.983333"),
        delta
      );
    });

    it("50. User1 fails to borrow another 0.5k USDT, cause has attained to borrow capacity", async function () {
      let borrowAmount = await parseTokenAmount(iUSDT, "1000");
      let currentTotalBorrows = await iUSDT.totalBorrows();
      let marketData = await controller.markets(iUSDT.address);

      expect(
        borrowAmount
          .add(currentTotalBorrows)
          .sub(marketData.borrowCapacity)
          .toNumber()
      ).to.greaterThan(0);

      await expect(
        iUSDT.connect(user1).borrow(borrowAmount)
      ).to.be.revertedWith("Token borrow capacity reached");
    });

    it("51. Sets the collateral factor of the USDx to 100%", async function () {
      let newCollateralFactor = await parseTokenAmount(iUSDx, "1");

      await controller._setCollateralFactor(iUSDx.address, newCollateralFactor);
      let usdxCurrentCollateralFactor = (
        await controller.markets(iUSDx.address)
      )[0];

      expect(usdxCurrentCollateralFactor).to.equal(newCollateralFactor);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDT,
          underlying: USDT,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "30000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "38900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.18955199"),
          expectLiquidity: await parseTokenAmount(iUSDx, "30000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "19925.002238014"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "15737.5027600175"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "8500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16750.001958"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1000"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1000"),
          expectLiquidity: await parseTokenAmount(iUSDT, "1000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDT, "10000"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "10000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "15"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "33.20833341832"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "20.9833333683"),
        delta
      );
    });

    it("52. User1 supplies 1w USDx", async function () {
      let mintAmount = await parseTokenAmount(iUSDx, "10000");

      // GIve an enough supply capacity.
      let newSupplyCapacity = await parseTokenAmount(iUSDx, "1000000");
      await controller._setSupplyCapacity(iUSDx.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDx.address);
      expect(marketData.supplyCapacity).to.equal(newSupplyCapacity);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: mintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "40000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "48900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "48900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.78656649966"),
          expectLiquidity: await parseTokenAmount(iUSDx, "40000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "29925.002238014"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "25737.5027600175"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "8500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16750.004048"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectLiquidity: await parseTokenAmount(iUSDT, "1000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.007402"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.007402"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.9999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);
    });

    it("53. User1 borrows 2 ETH", async function () {
      let borrowAmount = await parseTokenAmount(iETH, "2");

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "40000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "48900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "48900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.60027782"),
          expectLiquidity: await parseTokenAmount(iUSDx, "40000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "28724.999705673"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "24237.4995945921"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "8500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17950.005093"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectLiquidity: await parseTokenAmount(iUSDT, "1000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.008312"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.008312"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.445"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "34.25"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "32.316666"),
        delta
      );
    });

    it("54. User1 withdraws 0.05 WBTC", async function () {
      let withdrawAmount = await parseTokenAmount(iWBTC, "0.05");

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iWBTC,
          underlying: WBTC,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "40000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.55849495"),
          expectLiquidity: await parseTokenAmount(iUSDx, "40000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "27974.999705673"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "23487.4995945921"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "8500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17950.006174"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "999.99"),
          expectLiquidity: await parseTokenAmount(iUSDT, "1000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.008312"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.008312"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "34.25"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "31.316666"),
        delta
      );
    });

    it("55. User1 repay 1k USDT", async function () {
      let repayAmount = await parseTokenAmount(iUSDT, "1000");

      let caseDetails = [
        {
          user: user1,
          action: "repay",
          asset: iUSDT,
          underlying: USDT,
          amount: repayAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "40000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.709438377"),
          expectLiquidity: await parseTokenAmount(iUSDx, "40000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "28974.999705673"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "24737.4914583421"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "7500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16950.007255"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.99"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.99"),
          expectLiquidity: await parseTokenAmount(iUSDT, "2000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.008312"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.010135"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "34.25"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "32.983321441"),
        delta
      );
    });

    it("56. Sets ETH borrow factot to 75%", async function () {
      let newETHBorrowFactor = await parseTokenAmount(iETH, "0.75");
      await controller._setBorrowFactor(iETH.address, newETHBorrowFactor);
      let marketData = await controller.markets(iETH.address);
      expect(marketData.borrowFactorMantissa).to.equal(newETHBorrowFactor);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDT,
          underlying: USDT,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "40000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "47900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.284825092"),
          expectLiquidity: await parseTokenAmount(iUSDx, "40000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "25824.994306898"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "20799.9928461228"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "7500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16950.007869"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectLiquidity: await parseTokenAmount(iUSDT, "2000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.010592"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.010592"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.28124212"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "20.799992"),
        delta
      );
    });

    it("57. User1 supplies 1w USDx", async function () {
      let mintAmount = await parseTokenAmount(iUSDx, "10000");

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: mintAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "50000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "57900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "57900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.782337267"),
          expectLiquidity: await parseTokenAmount(iUSDx, "50000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "35824.994306898"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "30799.9928461228"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "7500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "16950.008484"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectLiquidity: await parseTokenAmount(iUSDT, "2000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.01105"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.01105"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "34.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "30.79999"),
        delta
      );
    });

    it("58. User1 borrows 2 ETH", async function () {
      let borrowAmount = await parseTokenAmount(iETH, "2");

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "50000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "57900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "57900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.577187968"),
          expectLiquidity: await parseTokenAmount(iUSDx, "50000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "34224.993300049"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "28799.9915875621"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "7500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "18150.00909"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectLiquidity: await parseTokenAmount(iUSDT, "2000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.011508"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.011508"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.395"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "28.799991"),
        delta
      );
    });

    it("60. User1 withdraws 0.05 WBTC", async function () {
      let withdrawAmount = await parseTokenAmount(iWBTC, "0.05");

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iWBTC,
          underlying: WBTC,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "50000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "56900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "56900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.542625685"),
          expectLiquidity: await parseTokenAmount(iUSDx, "50000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "33474.993300049"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "28049.9915875621"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "7500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "18150.00975"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "1999.98"),
          expectLiquidity: await parseTokenAmount(iUSDT, "2000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.011965"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.011965"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "28.04999126"),
        delta
      );
    });

    it("61. User1 repays 1k USDT", async function () {
      let repayAmount = await parseTokenAmount(iUSDT, "1000");

      let caseDetails = [
        {
          user: user1,
          action: "repay",
          asset: iUSDT,
          underlying: USDT,
          amount: repayAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "50000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "56900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "56900"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.665457698"),
          expectLiquidity: await parseTokenAmount(iUSDx, "50000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "34474.990982049"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "29299.9886900621"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17150.0104101"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.98"),
          expectSafeAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.98"),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.012423"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.012423"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "29.29998805"),
        delta
      );
    });

    it("62. Sets WBTC collateral factor to 0%", async function () {
      let newCollateralFactor = await parseTokenAmount(iWBTC, "0");

      await controller._setCollateralFactor(iWBTC.address, newCollateralFactor);
      let wbtcCurrentCollateralFactor = (
        await controller.markets(iWBTC.address)
      )[0];

      expect(wbtcCurrentCollateralFactor).to.equal(newCollateralFactor);

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDT,
          underlying: USDT,
          amount: ZERO,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "50000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "56900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "50000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.415457751"),
          expectLiquidity: await parseTokenAmount(iUSDx, "50000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "29299.990832049"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "24124.9885400621"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17150.0108319189"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.986358"),
          expectSafeAvaiableBorrow: await parseTokenAmount(
            iUSDT,
            "2999.986358"
          ),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.012653"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.012653"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "24.12498758"),
        delta
      );
    });

    it("63. User1 supplies 1w USDx", async function () {
      let supplyAmount = await parseTokenAmount(iUSDx, "10000");

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: supplyAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "60000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "66900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "60000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.898549233"),
          expectLiquidity: await parseTokenAmount(iUSDx, "60000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "39299.990832049"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "34124.9885400621"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17150.0112547377"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.986358"),
          expectSafeAvaiableBorrow: await parseTokenAmount(
            iUSDT,
            "2999.986358"
          ),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.012883"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.012883"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "32.25001"),
        delta
      );
    });

    it("64. User1 borrows 2 ETH", async function () {
      let borrowAmount = await parseTokenAmount(iETH, "2");

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iETH,
          underlying: zeroAddress,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "60000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "66900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "60000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.690581615"),
          expectLiquidity: await parseTokenAmount(iUSDx, "60000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "37699.989553257"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "32124.9869415724"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "18350.0116775565"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.986358"),
          expectSafeAvaiableBorrow: await parseTokenAmount(
            iUSDT,
            "2999.986358"
          ),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.013113"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.013113"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.345"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "30.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "30.25001"),
        delta
      );
    });

    it("65. User1 withdraws 0.05 WBTC", async function () {
      let withdrawAmount = await parseTokenAmount(iWBTC, "0.05");

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iWBTC,
          underlying: WBTC,
          amount: withdrawAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "60000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "65900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "60000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.690581549"),
          expectLiquidity: await parseTokenAmount(iUSDx, "60000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "37699.989553257"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "32124.9869415724"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "6500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "18350.0121460373"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "2999.985612"),
          expectSafeAvaiableBorrow: await parseTokenAmount(
            iUSDT,
            "2999.985612"
          ),
          expectLiquidity: await parseTokenAmount(iUSDT, "3000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.013343"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.013343"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.295"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.295"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "30.25"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "30.25"),
        delta
      );
    });

    it("66. User1 repays 1k USDT", async function () {
      let repayAmount = await parseTokenAmount(iUSDT, "1000");

      let caseDetails = [
        {
          user: user1,
          action: "repay",
          asset: iUSDT,
          underlying: USDT,
          amount: repayAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      // Attention!!!
      // expectResult = [allDataOfUser1ForUSDx, allDataOfUser1ForUSDT, allDataOfUser2ForUSDT]
      let expectResults = [
        {
          user: user1,
          asset: iUSDx,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDx, "60000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(iUSDx, "65900"),
          expectCollateralBalanceValue: await parseTokenAmount(iUSDx, "60000"),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "2.81689979"),
          expectLiquidity: await parseTokenAmount(iUSDx, "60000"),
          expectMaxAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "38699.988399257"
          ),
          expectMaxSafeAvaiableWithdrawValue: await parseTokenAmount(
            iUSDx,
            "33374.9854990724"
          ),
        },
        {
          user: user1,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBorrowedBalance: await parseTokenAmount(iUSDT, "5500"),
          expectiTokenBorrowedBalanceValue: await parseTokenAmount(
            iUSDx,
            "17350.01261451826"
          ),
          expectMaxAvaiableBorrow: await parseTokenAmount(iUSDT, "3999.985363"),
          expectSafeAvaiableBorrow: await parseTokenAmount(
            iUSDT,
            "3999.985363"
          ),
          expectLiquidity: await parseTokenAmount(iUSDT, "4000"),
        },
        {
          user: user2,
          asset: iUSDT,
          isStableCoin: true,
          expectiTokenBalance: await parseTokenAmount(iUSDT, "10000"),
          expectiTokenTotalBalanceValue: await parseTokenAmount(
            iUSDT,
            "10000.013573"
          ),
          expectCollateralBalanceValue: await parseTokenAmount(
            iUSDx,
            "10000.013573"
          ),
          expectHealthyFactor: await parseTokenAmount(iUSDx, "14.99999"),
        },
      ];
      await executeOperations(caseDetails, expectResults);

      let delta = 0.00001;
      let allDataOfUser1ForWBTC = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iWBTC,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForWBTC.availableToWithdraw,
        await parseTokenAmount(iWBTC, "0.295"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForWBTC.safeAvailableToWithdraw,
        await parseTokenAmount(iWBTC, "0.295"),
        delta
      );

      let allDataOfUser1ForETH = await getAllData(
        oracle,
        controller,
        lendingData,
        user1.address,
        iETH,
        "false",
        ethers.utils.parseEther("0.8")
      );

      verifyAllowError(
        allDataOfUser1ForETH.availableBorrow,
        await parseTokenAmount(iETH, "30.25001"),
        delta
      );
      verifyAllowError(
        allDataOfUser1ForETH.safeAvailableToBorrow,
        await parseTokenAmount(iETH, "30.25001"),
        delta
      );
    });

    it("67. Pause the minting of the USDx", async function () {
      let mintState = (await controller.markets(iUSDx.address)).mintPaused;
      expect(mintState, false);

      // pause the minting of the usdx.
      await controller._setMintPaused(iUSDx.address, true);
      mintState = (await controller.markets(iUSDx.address)).mintPaused;
      expect(mintState, true);

      let amount = await parseTokenAmount(iUSDx, "10");

      await expect(
        iUSDx.connect(user1).mint(user1.address, amount)
      ).to.be.revertedWith("revert Token mint has been paused");

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user2,
          action: "borrow",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user2,
          action: "repay",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      await executeOperations(caseDetails);
    });

    it("68. Pause the borrowing of the USDx", async function () {
      let amount = await parseTokenAmount(iUSDx, "10");
      // for the following repay.
      await iUSDx.connect(user2).borrow(await parseTokenAmount(iUSDx, "100"));
      let borrowState = (await controller.markets(iUSDx.address)).borrowPaused;
      expect(borrowState, false);

      // pause the borrowing of the usdx.
      await controller._setBorrowPaused(iUSDx.address, true);
      borrowState = (await controller.markets(iUSDx.address)).borrowPaused;
      expect(borrowState, true);

      await expect(iUSDx.connect(user2).borrow(amount)).to.be.revertedWith(
        "revert Token borrow has been paused"
      );

      let caseDetails = [
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user2,
          action: "repay",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      await executeOperations(caseDetails);
    });

    it("69. Pause the redeeming of the USDx", async function () {
      let redeemState = (await controller.markets(iUSDx.address)).redeemPaused;
      expect(redeemState, false);

      // pause the redeeming of the usdx.
      await controller._setRedeemPaused(iUSDx.address, true);
      redeemState = (await controller.markets(iUSDx.address)).redeemPaused;
      expect(redeemState, true);

      let amount = await parseTokenAmount(iUSDx, "10");

      await expect(
        iUSDx.connect(user1).redeemUnderlying(user1.address, amount)
      ).to.be.revertedWith("revert Token redeem has been paused");

      await expect(
        iUSDx.connect(user1).redeem(user1.address, amount)
      ).to.be.revertedWith("revert Token redeem has been paused");

      let caseDetails = [
        {
          user: user2,
          action: "repay",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      await executeOperations(caseDetails);
    });

    it("70. Pause the transfer of the iUSDx", async function () {
      let transferState = await controller.transferPaused();
      expect(transferState, false);

      // pause the minting of the usdx.
      await controller._setTransferPaused(true);
      transferState = await controller.transferPaused();
      expect(transferState, true);

      let usdxAmount = await parseTokenAmount(iUSDx, "10");
      let usdtAmount = await parseTokenAmount(iUSDT, "10");

      await expect(
        iUSDx.connect(user1).transfer(user2.address, usdxAmount)
      ).to.be.revertedWith("revert Transfer has been paused");

      await expect(
        iUSDT.connect(user1).transfer(user2.address, usdtAmount)
      ).to.be.revertedWith("revert Transfer has been paused");
    });

    it("71. After pausing the transfer, check behaviors", async function () {
      let amount = await parseTokenAmount(iUSDx, "10");

      await expect(
        iUSDx.connect(user1).mint(user1.address, amount)
      ).to.be.revertedWith("revert Token mint has been paused");

      await expect(iUSDx.connect(user2).borrow(amount)).to.be.revertedWith(
        "revert Token borrow has been paused"
      );

      await expect(
        iUSDx.connect(user1).redeemUnderlying(user1.address, amount)
      ).to.be.revertedWith("revert Token redeem has been paused");

      await expect(
        iUSDx.connect(user1).redeem(user1.address, amount)
      ).to.be.revertedWith("revert Token redeem has been paused");

      let caseDetails = [
        {
          user: user2,
          action: "repay",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      await executeOperations(caseDetails);
    });

    it("72. Unpause the minting, reddeming and borrowing of the USDx", async function () {
      // unpause the minting of the usdx.
      await controller._setMintPaused(iUSDx.address, false);
      let mintState = (await controller.markets(iUSDx.address)).mintPaused;
      expect(mintState, false);

      // unpause the borrowing of the usdx.
      await controller._setBorrowPaused(iUSDx.address, false);
      let borrowState = (await controller.markets(iUSDx.address)).borrowPaused;
      expect(borrowState, false);

      // unpause the redeeming of the usdx.
      await controller._setRedeemPaused(iUSDx.address, false);
      let redeemState = (await controller.markets(iUSDx.address)).redeemPaused;
      expect(redeemState, false);

      let amount = await parseTokenAmount(iUSDx, "10");

      await expect(
        iUSDx.connect(user1).transfer(user2.address, amount)
      ).to.be.revertedWith("revert Transfer has been paused");
    });

    it("73. After pausing the minting, reddeming and borrowing, check behaviors", async function () {
      let amount = await parseTokenAmount(iUSDx, "10");

      let caseDetails = [
        {
          user: user1,
          action: "mint",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user1,
          action: "redeemUnderlying",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user2,
          action: "borrow",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
        {
          user: user2,
          action: "repay",
          asset: iUSDx,
          underlying: USDx,
          amount: amount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
          interestRateModel: interestRateModel,
          safeFactor: ethers.utils.parseEther("0.8"),
        },
      ];

      await executeOperations(caseDetails);
    });

    it("74. Unpause the transfer of the iUSDx", async function () {
      // unpause the minting of the usdx.
      await controller._setTransferPaused(false);
      let transferState = await controller.transferPaused();
      expect(transferState, false);

      let usdxAmount = await parseTokenAmount(iUSDx, "10");
      let usdtAmount = await parseTokenAmount(iUSDT, "10");

      await expect(() =>
        iUSDx.connect(user1).transfer(user2.address, usdxAmount)
      ).to.changeTokenBalances(
        iUSDx,
        [user1, user2],
        [usdxAmount.mul(ethers.BigNumber.from(-1)), usdxAmount]
      );

      await expect(() =>
        iUSDT.connect(user2).transfer(user1.address, usdtAmount)
      ).to.changeTokenBalances(
        iUSDT,
        [user2, user1],
        [usdtAmount.mul(ethers.BigNumber.from(-1)), usdtAmount]
      );
    });

    it.skip("75. Make a flashloan to get token amount that between borrow cap and supply cap", async function () {
      let flashloanAmount = utils.parseUnits("120000");

      // Set iUSDx borrow capacity to 10w.
      let borrowCapacity = utils.parseUnits("100000");
      await controller._setBorrowCapacity(iUSDx.address, borrowCapacity);

      // Set iUSDx supply capacity to 20w.
      let supplyCapacity = utils.parseUnits("200000");
      await controller._setSupplyCapacity(iUSDx.address, supplyCapacity);

      // Supply more USDx for flashloan.
      await iUSDx.connect(user3).mint(user3.address, borrowCapacity);

      const flashloanFeeRate = await iUSDx.flashloanFeeRatio();
      const flashloanFeeAmount = flashloanFeeRate
        .mul(flashloanAmount)
        .div(BASE);
      const expectRepayAmount = flashloanFeeAmount;

      // add enough undelying token to the flashloan executor contract to repay.
      await USDx.connect(user3).transfer(
        flashloanExecutor.address,
        flashloanAmount
      );

      const beforeiTokenCash = await iUSDx.getCash();
      const beforeExchangeRate = await iUSDx.exchangeRateStored();
      // execute flashloan.
      await iUSDx
        .connect(user3)
        .flashloan(flashloanExecutor.address, flashloanAmount, "0x");
      const afteriTokenCash = await iUSDx.getCash();
      await iUSDx.connect(user1).exchangeRateCurrent();
      const afterExchangeRate = await iUSDx.exchangeRateStored();

      expect(afteriTokenCash.sub(beforeiTokenCash)).to.equal(expectRepayAmount);
      expect(afterExchangeRate).to.gt(beforeExchangeRate);
    });

    it("76. Pause liquidating", async function () {
      // makes a large enough supply capacity.
      let supplyCapacity = utils.parseUnits("900000");
      await controller._setSupplyCapacity(iUSDx.address, supplyCapacity);
      // supplies enough iUSDx to make other can borrow.
      await iUSDx
        .connect(user1)
        .mint(user1.address, await parseTokenAmount(iUSDx, "100000"));

      // uses a new account, user3, to supply WBTC and borrow USDx,
      // then change price the WBTC to generate a shortfall.
      await iWBTC
        .connect(user3)
        .mint(user3.address, await parseTokenAmount(iWBTC, "10"));
      await controller.connect(user3).enterMarkets([iWBTC.address]);

      // sets a new collateral factor for WBTC.
      let newCollateralFactor = await parseTokenAmount(iWBTC, "0.8");
      await controller._setCollateralFactor(iWBTC.address, newCollateralFactor);

      // get max borrow amount and then borrow.
      let borrowDetails = await lendingData.callStatic.getAccountBorrowInfo(
        iUSDx.address,
        user3.address,
        newCollateralFactor
      );
      await iUSDx.connect(user3).borrow(borrowDetails[0]);

      // user3 is expected to do not have a shortfall.
      let liquidateDetails = await controller.calcAccountEquity(user3.address);
      expect(liquidateDetails[1]).to.equal("0");

      // decrease the price of wbtc to make user3 have a shortfall.
      await setOraclePrices(oracle, [iWBTC], [10000]);

      let oldLiquidateDetails = await controller.calcAccountEquity(
        user3.address
      );
      expect(oldLiquidateDetails[1]).to.be.gt("0");

      // before pausing liquidation, users can be liquidated normally.
      await iUSDx
        .connect(user1)
        .liquidateBorrow(user3.address, "10000", iWBTC.address);
      let newLiquidateDetails = await controller.calcAccountEquity(
        user3.address
      );
      expect(newLiquidateDetails[1]).to.be.lt(oldLiquidateDetails[1]);

      let liquidateState = await controller.seizePaused();
      expect(liquidateState, false);

      // pause the liquidation.
      await controller._setSeizePaused(true);
      liquidateState = await controller.seizePaused();
      expect(liquidateState, true);

      // fail to liquidate.
      await expect(
        iUSDx
          .connect(user1)
          .liquidateBorrow(user3.address, "10000", iWBTC.address)
      ).to.be.revertedWith("revert Seize has been paused");
    });

    it("77. Supply wbtc to xUSD should fail due to does not enter market", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      // user1 supplies 1 wbtc
      let supplyAmount = await parseTokenAmount(iWBTC, "1");
      await iWBTC.connect(user1).mint(user1.address, supplyAmount);

      // try to mint xUSD and xEUR
      await expect(iMUSX.connect(user1).borrow("10000")).to.be.revertedWith(
        "Account has some shortfall"
      );

      await expect(iMEUX.connect(user1).borrow("10000")).to.be.revertedWith(
        "Account has some shortfall"
      );
    });

    it("78. Supply 1w USDC and the borrow xUSD and xEUR", async function () {
      // user1 supplies 1w USDT
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 100);
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iMUSX,
          tokenType: "iMSD",
          underlying: xUSD,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
        {
          user: user1,
          action: "borrow",
          asset: iMEUX,
          tokenType: "iMSD",
          underlying: xEUR,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      await executeOperations(caseDetails);

      let borrowDetails = await lendingData.callStatic.getAccountBorrowDataForTest(
        iMUSX.address,
        user1.address,
        ethers.utils.parseEther("1")
      );
      // console.log("borrowDetails", borrowDetails)
      // let maxBorrowAmount = borrowDetails[2];
      // expect(maxBorrowAmount).to.gt(0);
      // console.log("maxBorrowAmount", maxBorrowAmount.toString());

      // // borrow max amount xUSD
      // caseDetails = [
      //   {
      //     user: user1,
      //     action: "borrow",
      //     asset: iMUSX,
      //     underlying: xUSD,
      //     amount: maxBorrowAmount,
      //     // amount: maxBorrowAmount.sub(ethers.utils.parseEther("1")),
      //     isStableCoin: true,
      //     lendingData: lendingData,
      //     controller: controller,
      //     oracle: oracle,
      //   },
      // ];

      // await executeOperations(caseDetails);

      // let liquidateDetails = await controller.calcAccountEquity(user1.address);
      // let collateralBalance = liquidateDetails[0];
      // let shortfall = liquidateDetails[1];
      // // console.log("liquidateDetails", liquidateDetails);
      // expect(Number(collateralBalance.toString())).to.be.closeTo(0, delta);
      // expect(shortfall).to.equal(0);

      // await expect(
      //   iMUSX.connect(user1).borrow(user1.address, ethers.BigNumber.from("10000"))
      // ).to.be.revertedWith("Account has some shortfall");
    });

    it.skip("79. Uses wbtc as collateral to mint xUSD and xEUR.", async function () {
      let borrowAmount = await parseTokenAmount(xEUR, 100);
      await controller.connect(user1).enterMarkets([iWBTC.address]);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iMUSX,
          underlying: xUSD,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
        {
          user: user1,
          action: "borrow",
          asset: iMEUX,
          underlying: xEUR,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      await executeOperations(caseDetails);

      // let liquidateDetails = await controller.calcAccountEquity(user1.address);
      // let collateralBalance = liquidateDetails[0];
      // let shortfall = liquidateDetails[1];
      // // console.log("liquidateDetails", liquidateDetails);
      // expect(Number(collateralBalance.toString())).to.be.closeTo(0, delta);
      // expect(shortfall).to.equal(0);

      // await expect(
      //   iMUSX.connect(user1).borrow(user1.address, ethers.BigNumber.from("10000"))
      // ).to.be.revertedWith("Account has some shortfall");
    });

    it.skip("80. Supply 1w USDC", async function () {
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 100);
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);

      let caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iWBTC,
          underlying: WBTC,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      await executeOperations(caseDetails);

      let borrowDetails = await lendingData.callStatic.getAccountBorrowInfo(
        iMUSX.address,
        user1.address,
        ethers.utils.parseEther("0.75")
      );
      let maxBorrowAmount = borrowDetails[0];
      expect(maxBorrowAmount).to.gt(0);

      caseDetails = [
        {
          user: user1,
          action: "borrow",
          asset: iMUSX,
          underlying: xUSD,
          amount: borrowAmount,
          isStableCoin: true,
          lendingData: lendingData,
          controller: controller,
          oracle: oracle,
        },
      ];

      await executeOperations(caseDetails);

      borrowDetails = await lendingData.callStatic.getAccountBorrowInfo(
        iMUSX.address,
        user1.address,
        ethers.utils.parseEther("0.75")
      );
      // console.log("borrowDetails", borrowDetails);
      maxBorrowAmount = borrowDetails[0];
      // expect(maxBorrowAmount).to.gt(0);
      // console.log("maxBorrowAmount", maxBorrowAmount.toString());
    });

    it("81. Mint 500 xUSD to withdraw earns when borrow rate is greater than supply rate", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let saveAmount = await parseTokenAmount(xUSDS, 100);
      let withdrawAmount = await parseTokenAmount(xUSD, 1);
      let newBlocks = 1000;

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      let borrowRate = ethers.utils.parseEther("0.03").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0.02").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // user1 supplies xUSDS
      await xUSD.connect(user1).approve(xUSDS.address, MAX);
      await xUSDS.connect(user1).mint(user1.address, saveAmount);

      await increaseBlock(newBlocks);

      let msdTokenDetails = await msdController.msdTokenData(xUSD.address);
      let msdsEarnedAmount = msdTokenDetails.earning;

      expect(msdsEarnedAmount).to.gt(0);

      //get extra xUSD to repay max
      await iUSDT.connect(user2).mint(user2.address, supplyAmount);
      await controller.connect(user2).enterMarkets([iUSDT.address]);
      await iMUSX.connect(user2).borrow(borrowAmount);
      await xUSD.connect(user2).transfer(user1.address, borrowAmount);
      // user1 repay iMUSX
      await xUSD.connect(user1).approve(iMUSX.address, MAX);
      await iMUSX.connect(user1).repayBorrow(MAX);

      // user1 withdraws xUSDS
      await xUSDS.connect(user1).redeem(user1.address, saveAmount);
      let xUSDSBalance = await xUSDS.balanceOf(user1.address);
      expect(xUSDSBalance).to.equal(0);

      await iMUSX.updateInterest();
      let equity = await msdController.callStatic.calcEquity(xUSD.address);
      let earnedAmount = equity[0];

      expect(earnedAmount).to.gt("10000");

      await msdController._withdrawReserves(xUSD.address, earnedAmount);

      await iMUSX.updateInterest();
      equity = await msdController.callStatic.calcEquity(xUSD.address);
      earnedAmount = equity[0];

      expect(earnedAmount).to.lt(withdrawAmount);

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          await parseTokenAmount(xUSD, 0.001)
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("82. Mint 500 xUSD to withdraw earns when borrow interests is equal to supply interests", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let saveAmount = await parseTokenAmount(xUSDS, 100);
      let newBlocks = 1000;

      let borrowRate = ethers.utils.parseEther("0.03").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0.15").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      // user1 supplies xUSDS
      await xUSD.connect(user1).approve(xUSDS.address, MAX);
      await xUSDS.connect(user1).mint(user1.address, saveAmount);

      await increaseBlock(newBlocks);

      // stop to accrue interests
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, "0");
      await increaseBlock(1);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, "0");

      // update the interests
      await iMUSX.updateInterest();
      await xUSDS.updateInterest();

      let msdTokenDetails = await msdController.msdTokenData(xUSD.address);
      let msdsEarnedAmount = msdTokenDetails.earning;
      let imsdDebtAmount = msdTokenDetails.debt;

      expect(msdsEarnedAmount).to.gt(0);
      expect(imsdDebtAmount).to.gt(0);
      expect(Number(msdsEarnedAmount.toString())).to.closeTo(
        Number(imsdDebtAmount.toString()),
        500000
      );

      //get extra xUSD to repay max
      await iUSDT.connect(user2).mint(user2.address, supplyAmount);
      await controller.connect(user2).enterMarkets([iUSDT.address]);
      await iMUSX.connect(user2).borrow(borrowAmount);
      await xUSD.connect(user2).transfer(user1.address, borrowAmount);
      // user1 repay iMUSX
      await xUSD.connect(user1).approve(iMUSX.address, MAX);
      await iMUSX.connect(user1).repayBorrow(MAX);
      let ixUSDBorrowedAmount = await iMUSX.callStatic.borrowBalanceCurrent(
        user1.address
      );
      expect(ixUSDBorrowedAmount).to.equal(0);

      // user1 withdraws xUSDS
      await xUSDS.connect(user1).redeem(user1.address, saveAmount);
      let xUSDSBalance = await xUSDS.balanceOf(user1.address);
      expect(xUSDSBalance).to.equal(0);

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          await parseTokenAmount(xUSD, 0.001)
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("83. Mint 500 xUSD but withdraw too much reserves", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let newBlocks = 1000;

      let borrowRate = ethers.utils.parseEther("0.03").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0.15").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      await increaseBlock(newBlocks);

      // Equity will be current equity plus 1 block accumulation
      const equity = (
        await msdController.callStatic.calcEquity(xUSD.address)
      )[0].add(await msdEquityPerBlock(iMUSX, xUSDS));

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          equity.add(1) // 1wei more than the estimated equity
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("84. Borrow rate is 0, and supply rate is greater than 0", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let saveAmount = await parseTokenAmount(xUSDS, 100);
      let newBlocks = 1000;

      let borrowRate = ethers.utils.parseEther("0").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0.4").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      // user1 supplies xUSDS
      await xUSD.connect(user1).approve(xUSDS.address, MAX);
      await xUSDS.connect(user1).mint(user1.address, saveAmount);

      await increaseBlock(newBlocks);

      // user1 withdraws xUSDS
      await xUSDS.connect(user1).redeem(user1.address, saveAmount);
      let xUSDBalance = await xUSD.balanceOf(user1.address);
      // supply rate is greater than 0, so expect to get some interests,
      // and the principal will increase
      expect(xUSDBalance).to.gt(borrowAmount);

      // user1 repay iMUSX
      await xUSD.connect(user1).approve(iMUSX.address, MAX);
      // no borrow rate, so repay the borrowed amount, and then there will be no borrowed.
      await iMUSX.connect(user1).repayBorrow(borrowAmount);
      let ixUSDBorrowedAmount = await iMUSX.callStatic.borrowBalanceCurrent(
        user1.address
      );
      expect(ixUSDBorrowedAmount).to.equal(0);

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          await parseTokenAmount(xUSD, 0.001)
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("85. Borrow rate is 0, and supply rate is 0", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let saveAmount = await parseTokenAmount(xUSDS, 100);
      let newBlocks = 1000;

      let borrowRate = ethers.utils.parseEther("0").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      // user1 supplies xUSDS
      await xUSD.connect(user1).approve(xUSDS.address, MAX);
      await xUSDS.connect(user1).mint(user1.address, saveAmount);

      await increaseBlock(newBlocks);

      // user1 withdraws xUSDS
      await xUSDS.connect(user1).redeem(user1.address, saveAmount);
      let xUSDBalance = await xUSD.balanceOf(user1.address);
      // no supply rate, so will not get any interests.
      expect(xUSDBalance).to.equal(borrowAmount);

      // user1 repay iMUSX
      await xUSD.connect(user1).approve(iMUSX.address, MAX);
      // no borrow rate, so repay the borrowed amount, and then there will be no borrowed.
      await iMUSX.connect(user1).repayBorrow(borrowAmount);
      let ixUSDBorrowedAmount = await iMUSX.callStatic.borrowBalanceCurrent(
        user1.address
      );
      expect(ixUSDBorrowedAmount).to.equal(0);

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          await parseTokenAmount(xUSD, 0.001)
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("86. Borrow rate is greater than 0, and supply rate is 0", async function () {
      await init();
      await controller.connect(user1).enterMarkets([iUSDT.address]);
      let supplyAmount = await parseTokenAmount(iUSDT, 10000);
      let borrowAmount = await parseTokenAmount(xUSD, 500);
      let saveAmount = await parseTokenAmount(xUSDS, 100);
      let newBlocks = 1000;

      let borrowRate = ethers.utils.parseEther("0.03").div(blocksPerYear);
      let supplyRate = ethers.utils.parseEther("0").div(blocksPerYear);
      await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);
      await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

      // In order to borrow MSD token
      await iUSDT.connect(user1).mint(user1.address, supplyAmount);
      await iMUSX.connect(user1).borrow(borrowAmount);

      // user1 supplies xUSDS
      await xUSD.connect(user1).approve(xUSDS.address, MAX);
      await xUSDS.connect(user1).mint(user1.address, saveAmount);

      await increaseBlock(newBlocks);

      // user1 withdraws xUSDS
      await xUSDS.connect(user1).redeem(user1.address, saveAmount);
      let xUSDBalance = await xUSD.balanceOf(user1.address);
      // no supply rate, so will not get any interests.
      expect(xUSDBalance).to.equal(borrowAmount);

      // user1 repay iMUSX
      await xUSD.connect(user1).approve(iMUSX.address, MAX);
      // borrow rate is greater than 0, so when repay the borrowed amount,
      // there is still remaining borrowed amount.
      await iMUSX.connect(user1).repayBorrow(borrowAmount);
      let ixUSDBorrowedAmount = await iMUSX.callStatic.borrowBalanceCurrent(
        user1.address
      );
      expect(ixUSDBorrowedAmount).to.gt(0);

      // borrow rate is greater than 0, so this will generate interests.
      await iMUSX.updateInterest();
      let equity = await msdController.callStatic.calcEquity(xUSD.address);
      let earnedAmount = equity[0];
      expect(earnedAmount).to.gt("10000");

      // can withdraw all earned amount
      await msdController._withdrawReserves(xUSD.address, earnedAmount);

      await expect(
        msdController._withdrawReserves(
          xUSD.address,
          await parseTokenAmount(xUSD, 0.001)
        )
      ).to.be.revertedWith("Token do not have enough reserve");
    });

    it("87. Set USDx supply capacity is 0", async function () {
      await init();
      let newSupplyCapacity = await parseTokenAmount(iUSDx, "0");
      await controller._setSupplyCapacity(iUSDx.address, newSupplyCapacity);
      marketData = await controller.markets(iUSDx.address);
      expect(marketData.supplyCapacity).to.equal(newSupplyCapacity);

      await expect(
        iUSDx
          .connect(user1)
          .mint(user1.address, await parseTokenAmount(iUSDx, "1"))
      ).to.be.revertedWith("Token supply capacity reached");
    });

    it("88. Set liquidation incentive to 0", async function () {
      // initialize environment
      await init();

      // User3 supplies and borrows, then change the price to make (users[13]) have a shortfall,
      // then user1 tries to liquidate (users[13]).

      // (users[13]) supplies iUSDx, and sets it as collateral.
      await USDx.connect(users[13]).approve(iUSDx.address, MAX);
      await iUSDx
        .connect(users[13])
        .mint(users[13].address, ethers.utils.parseEther("5000"));
      await controller.connect(users[13]).enterMarkets([iUSDx.address]);

      let user13iUSDxBalance = await iUSDx.balanceOf(users[13].address);

      // No borrows, so user does not have shortfall.
      let liquidateDetails = await controller.calcAccountEquity(
        users[13].address
      );

      expect(liquidateDetails[1]).to.equal(0);

      // The price of iUSDx is 1, and its collateral factor is 0.9, so all collateral value is
      // 5000 * 1 * 0.9 = 4500, cause eth price is 600, so when borrow eth, max borrow amount
      // is: 4500 / 600 = 7.5
      let borrowAmount = await parseTokenAmount(iETH, "7");

      // User1 supplies some eth
      await iETH
        .connect(user1)
        .mint(user1.address, { value: await parseTokenAmount(iETH, "20") });
      await controller.connect(user1).enterMarkets([iETH.address]);
      await iETH.connect(users[13]).borrow(borrowAmount);

      // Increase the price of iETH, so (users[13]) will have a shortfall.
      await setOraclePrices(oracle, [iETH], [1000]);

      liquidateDetails = await controller.calcAccountEquity(users[13].address);

      expect(liquidateDetails[0]).to.equal(0);
      let shortfall = liquidateDetails[1];
      expect(shortfall).to.gt(0);

      // user1 is going to liquidate (users[13]).
      await iETH
        .connect(user1)
        .liquidateBorrow(users[13].address, iUSDx.address, {
          value: await parseTokenAmount(iETH, "1"),
        });

      // Cause liquidate incentive is 10%, and ETH price is 1000, iUSDx price is 1
      // so when liquidator repay 1 eth, he can get 1*1000*1.1=1100 iUSDx
      let expectiUSDxBalance = await parseTokenAmount(iUSDx, "1100");

      let actualiUSDxBalance = await iUSDx.balanceOf(user1.address);
      expect(expectiUSDxBalance).to.equal(actualiUSDxBalance);
    });

    it("89. Set reserve ratio to 0", async function () {
      let newReserveRatio = ethers.BigNumber.from("0");
      // Set reserve ratio to 0.
      await iUSDT._setNewReserveRatio(newReserveRatio);
      let iUSDTReserveRatio = await iUSDT.reserveRatio();
      expect(iUSDTReserveRatio).to.equal(newReserveRatio);

      // user2 supplies some USDT
      await USDT.connect(user2).approve(iUSDT.address, MAX);
      await iUSDT
        .connect(user2)
        .mint(user2.address, await parseTokenAmount(iUSDT, "1000"));

      // Borrow some USDT to accrue borrow interest.
      let borrowAmount = await parseTokenAmount(iUSDT, "100");
      await iUSDT.connect(user1).borrow(borrowAmount);

      // When reserve ratio is equal to 0, `totalReserves` will not increase.
      let oldTotalReserves = await iUSDT.totalReserves();
      let oldTotalBorrows = await iUSDT.totalBorrows();

      // Mine some blocks to accrue the borrow interest.
      await increaseBlock(300);

      await iUSDT.updateInterest();
      let newTotalReserves = await iUSDT.totalReserves();
      let newTotalBorrows = await iUSDT.totalBorrows();

      expect(oldTotalReserves).to.equal(newTotalReserves);
      expect(newTotalBorrows).to.gt(oldTotalBorrows);
    });

    it("90. Set reserve ratio to 100%", async function () {
      let newReserveRatio = BASE;
      // Set reserve ratio to 100%.
      await iUSDT._setNewReserveRatio(newReserveRatio);
      let iUSDTReserveRatio = await iUSDT.reserveRatio();
      expect(iUSDTReserveRatio).to.equal(newReserveRatio);

      await iUSDT.updateInterest();
      // When reserve ratio is equal to 100%, the changed amount of `totalReserves`
      // is equal to the changed amount of `totalBorrows`.
      let oldTotalReserves = await iUSDT.totalReserves();
      let oldTotalBorrows = await iUSDT.totalBorrows();

      // Mine some blocks to accrue the borrow interest.
      await increaseBlock(300);

      await iUSDT.updateInterest();
      let newTotalReserves = await iUSDT.totalReserves();
      let newTotalBorrows = await iUSDT.totalBorrows();

      let accruedInterest = newTotalReserves.sub(oldTotalReserves);

      expect(newTotalReserves).to.gt(oldTotalReserves);
      expect(newTotalBorrows.sub(accruedInterest)).to.equal(oldTotalBorrows);
    });
  });
});
