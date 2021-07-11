const { expect, util } = require("chai");
const { ethers } = require("hardhat");
const { utils, Contract } = require("ethers");
const {
  loadFixture,
  increaseBlock,
  fixtureDefault,
  deployRewardDistributor,
  deployMSDController,
  fixtureDeployOracle,
  deployiToken,
} = require("../helpers/fixtures.js");
const { parseTokenAmount, setOraclePrices } = require("../helpers/utils.js");

const zeroAddress = ethers.constants.AddressZero;
const MAX = ethers.constants.MaxUint256;
const BASE = utils.parseEther("1");
const ZERO = ethers.BigNumber.from("0");
const blocksPerYear = ethers.BigNumber.from("2102400");

const abiCoder = new ethers.utils.AbiCoder();

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

let timelock;
let newiToken;

describe("Governance Examination for Controller", function () {
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
    // [user1, user2, user3] = users;

    // Deploy the governance contract
    const Timelock = await ethers.getContractFactory("Timelock");
    timelock = await Timelock.deploy();
    await timelock.deployed();

    // Deploy a new iToken.
    newiToken = (
      await deployiToken(
        USDx.address,
        "New Tokne",
        "NT",
        controller.address,
        interestRateModel.address
      )
    ).iToken;

    await setOraclePrices(oracle, [newiToken], [1]);
  }

  describe("Test controller contract", function () {
    before("Transfer controller owner to timelock contract", async function () {
      await init();
      // transfer ownership to governance contract
      await controller._setPendingOwner(timelock.address);
      await timelock.executeTransaction(
        controller.address,
        0,
        "_acceptOwner()",
        "0x"
      );
      let owner = await controller.owner();
      expect(owner).to.equal(timelock.address);
    });

    it("Add new iToken to market", async function () {
      let input = "500000000000000000";
      let beforeAllTokensLength = (await controller.getAlliTokens()).length;

      let data = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [newiToken.address, input, input, input, input, input]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_addMarket(address,uint256,uint256,uint256,uint256,uint256)",
        data
      );
      let afterAllTokensLength = (await controller.getAlliTokens()).length;

      expect(beforeAllTokensLength + 1).to.equal(afterAllTokensLength);
    });

    it("Set new close factor", async function () {
      let closeFactor = "300000000000000000";

      let data = abiCoder.encode(["uint256"], [closeFactor]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setCloseFactor(uint256)",
        data
      );

      let newCloseFactor = await controller.closeFactorMantissa();

      expect(newCloseFactor).to.equal(closeFactor);
    });

    it("Set new liquidation incentive", async function () {
      let liquidationIncentive = "1400000000000000000";

      let data = abiCoder.encode(["uint256"], [liquidationIncentive]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setLiquidationIncentive(uint256)",
        data
      );

      let newLiquidationIncentive = await controller.liquidationIncentiveMantissa();

      expect(newLiquidationIncentive).to.equal(liquidationIncentive);
    });

    it("Set new collateral factor", async function () {
      let collateralFactor = "300000000000000000";

      let data = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, collateralFactor]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setCollateralFactor(address,uint256)",
        data
      );

      let newCollateralFactor = (await controller.markets(newiToken.address))
        .collateralFactorMantissa;

      expect(newCollateralFactor).to.equal(collateralFactor);
    });

    it("Set new borrow factor", async function () {
      let borrowFactor = "300000000000000000";

      let data = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, borrowFactor]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setBorrowFactor(address,uint256)",
        data
      );

      let newBorrowFactor = (await controller.markets(newiToken.address))
        .borrowFactorMantissa;

      expect(newBorrowFactor).to.equal(borrowFactor);
    });

    it("Set new supply capacity", async function () {
      let supplyCapacity = await parseTokenAmount(newiToken, "8545");

      let data = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, supplyCapacity]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setSupplyCapacity(address,uint256)",
        data
      );

      let newSupplyCapacity = (await controller.markets(newiToken.address))
        .supplyCapacity;

      expect(newSupplyCapacity).to.equal(supplyCapacity);
    });

    it("Set new borrow capacity", async function () {
      let borrowCapacity = await parseTokenAmount(newiToken, "7545");
      // let oldBorrowCapacity = (await controller.markets(newiToken.address)).borrowCapacity;
      // console.log("oldBorrowCapacity", oldBorrowCapacity.toString());

      let data = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, borrowCapacity]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setBorrowCapacity(address,uint256)",
        data
      );

      let newBorrowCapacity = (await controller.markets(newiToken.address))
        .borrowCapacity;
      // console.log("newBorrowCapacity", newBorrowCapacity.toString());

      expect(newBorrowCapacity).to.equal(borrowCapacity);
    });

    it("Set new pause guardian", async function () {
      let pauseGuardian = users[16];

      let data = abiCoder.encode(["address"], [pauseGuardian.address]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setPauseGuardian(address)",
        data
      );

      let newPauseGuardian = await controller.pauseGuardian();

      expect(newPauseGuardian).to.equal(pauseGuardian.address);
    });

    it("Set iToken mint paused", async function () {
      let mintPaused = true;
      // let oldiTokenMintPaused = (await controller.markets(newiToken.address)).mintPaused;
      // console.log("oldiTokenMintPaused", oldiTokenMintPaused);

      let data = abiCoder.encode(
        ["address", "bool"],
        [newiToken.address, mintPaused]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setMintPaused(address,bool)",
        data
      );

      let iTokenMintPaused = (await controller.markets(newiToken.address))
        .mintPaused;
      // console.log("iTokenMintPaused", iTokenMintPaused);

      expect(iTokenMintPaused).to.equal(mintPaused);
    });

    it("Set all iTokens mint paused", async function () {
      let mintPaused = true;
      // let oldiUSDTMintPaused = (await controller.markets(iUSDT.address)).mintPaused;
      // console.log("oldiUSDTMintPaused", oldiUSDTMintPaused);
      // let oldiUSDxMintPaused = (await controller.markets(iUSDx.address)).mintPaused;
      // console.log("oldiUSDxMintPaused", oldiUSDxMintPaused);

      let data = abiCoder.encode(["bool"], [mintPaused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setAllMintPaused(bool)",
        data
      );

      let newiUSDTMintPaused = (await controller.markets(iUSDT.address))
        .mintPaused;
      // console.log("newiUSDTMintPaused", newiUSDTMintPaused);
      let newiUSDxMintPaused = (await controller.markets(iUSDx.address))
        .mintPaused;
      // console.log("newiUSDxMintPaused", newiUSDxMintPaused);

      expect(newiUSDTMintPaused).to.equal(mintPaused);
      expect(newiUSDxMintPaused).to.equal(mintPaused);
    });

    it("Set iToken redeem paused", async function () {
      let redeemPaused = true;
      // let oldiTokenRedeemPaused = (await controller.markets(newiToken.address)).redeemPaused;
      // console.log("oldiTokenRedeemPaused", oldiTokenRedeemPaused);

      let data = abiCoder.encode(
        ["address", "bool"],
        [newiToken.address, redeemPaused]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setRedeemPaused(address,bool)",
        data
      );

      let iTokenRedeemPaused = (await controller.markets(newiToken.address))
        .redeemPaused;
      // console.log("iTokenRedeemPaused", iTokenRedeemPaused);

      expect(iTokenRedeemPaused).to.equal(redeemPaused);
    });

    it("Set all iTokens redeem paused", async function () {
      let redeemPaused = true;
      // let oldiUSDTRedeemPaused = (await controller.markets(iUSDT.address)).redeemPaused;
      // console.log("oldiUSDTRedeemPaused", oldiUSDTRedeemPaused);
      // let oldiUSDxRedeemPaused = (await controller.markets(iUSDx.address)).redeemPaused;
      // console.log("oldiUSDxRedeemPaused", oldiUSDxRedeemPaused);

      let data = abiCoder.encode(["bool"], [redeemPaused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setAllRedeemPaused(bool)",
        data
      );

      let newiUSDTRedeemPaused = (await controller.markets(iUSDT.address))
        .redeemPaused;
      // console.log("newiUSDTRedeemPaused", newiUSDTRedeemPaused);
      let newiUSDxRedeemPaused = (await controller.markets(iUSDx.address))
        .redeemPaused;
      // console.log("newiUSDxRedeemPaused", newiUSDxRedeemPaused);

      expect(newiUSDTRedeemPaused).to.equal(redeemPaused);
      expect(newiUSDxRedeemPaused).to.equal(redeemPaused);
    });

    it("Set iToken borrow paused", async function () {
      let borrowPaused = true;
      // let oldiTokenBorrowPaused = (await controller.markets(newiToken.address)).borrowPaused;
      // console.log("oldiTokenBorrowPaused", oldiTokenBorrowPaused);

      let data = abiCoder.encode(
        ["address", "bool"],
        [newiToken.address, borrowPaused]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setBorrowPaused(address,bool)",
        data
      );

      let iTokenBorrowPaused = (await controller.markets(newiToken.address))
        .borrowPaused;
      // console.log("iTokenBorrowPaused", iTokenBorrowPaused);

      expect(iTokenBorrowPaused).to.equal(borrowPaused);
    });

    it("Set all iTokens borrow paused", async function () {
      let borrowPaused = true;
      // let oldiUSDTBorrowPaused = (await controller.markets(iUSDT.address)).borrowPaused;
      // console.log("oldiUSDTBorrowPaused", oldiUSDTBorrowPaused);
      // let oldiUSDxBorrowPaused = (await controller.markets(iUSDx.address)).borrowPaused;
      // console.log("oldiUSDxBorrowPaused", oldiUSDxBorrowPaused);

      let data = abiCoder.encode(["bool"], [borrowPaused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setAllBorrowPaused(bool)",
        data
      );

      let newiUSDTBorrowPaused = (await controller.markets(iUSDT.address))
        .borrowPaused;
      // console.log("newiUSDTBorrowPaused", newiUSDTBorrowPaused);
      let newiUSDxBorrowPaused = (await controller.markets(iUSDx.address))
        .borrowPaused;
      // console.log("newiUSDxBorrowPaused", newiUSDxBorrowPaused);

      expect(newiUSDTBorrowPaused).to.equal(borrowPaused);
      expect(newiUSDxBorrowPaused).to.equal(borrowPaused);
    });

    it("Set iToken transfer paused", async function () {
      let transferPaused = true;
      // let oldiTokenTransferPaused = await controller.transferPaused();
      // console.log("oldiTokenTransferPaused", oldiTokenTransferPaused);

      let data = abiCoder.encode(["bool"], [transferPaused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setTransferPaused(bool)",
        data
      );

      let iTokenTransferPaused = await controller.transferPaused();
      // console.log("iTokenTransferPaused", iTokenTransferPaused);

      expect(iTokenTransferPaused).to.equal(transferPaused);
    });

    it("Set iToken seize paused", async function () {
      let seizePaused = true;
      // let oldiTokenSeizePaused = await controller.seizePaused();
      // console.log("oldiTokenSeizePaused", oldiTokenSeizePaused);

      let data = abiCoder.encode(["bool"], [seizePaused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setSeizePaused(bool)",
        data
      );

      let iTokenSeizePaused = await controller.seizePaused();
      // console.log("iTokenSeizePaused", iTokenSeizePaused);

      expect(iTokenSeizePaused).to.equal(seizePaused);
    });

    it("Set iToken paused to false", async function () {
      let paused = false;
      // let oldiTokenMintPaused = (await controller.markets(newiToken.address)).mintPaused;
      // console.log("oldiTokenMintPaused", oldiTokenMintPaused);
      // let oldiTokenBorrowPaused = (await controller.markets(newiToken.address)).borrowPaused;
      // console.log("oldiTokenBorrowPaused", oldiTokenBorrowPaused);
      // let oldiTokenRedeemPaused = (await controller.markets(newiToken.address)).redeemPaused;
      // console.log("oldiTokenRedeemPaused", oldiTokenRedeemPaused);

      let data = abiCoder.encode(
        ["address", "bool"],
        [newiToken.address, paused]
      );

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setiTokenPaused(address,bool)",
        data
      );

      let newiTokenMintPaused = (await controller.markets(newiToken.address))
        .mintPaused;
      // console.log("newiTokenMintPaused", newiTokenMintPaused);
      let newiTokenBorrowPaused = (await controller.markets(newiToken.address))
        .borrowPaused;
      // console.log("newiTokenBorrowPaused", newiTokenBorrowPaused);
      let newiTokenRedeemPaused = (await controller.markets(newiToken.address))
        .redeemPaused;
      // console.log("newiTokenRedeemPaused", newiTokenRedeemPaused);

      expect(newiTokenMintPaused).to.equal(paused);
      expect(newiTokenBorrowPaused).to.equal(paused);
      expect(newiTokenRedeemPaused).to.equal(paused);
    });

    it("Set protocol paused to false", async function () {
      let paused = false;
      // let oldiUSDTMintPaused = (await controller.markets(iUSDT.address)).mintPaused;
      // console.log("oldiUSDTMintPaused", oldiUSDTMintPaused);
      // let oldiUSDxBorrowPaused = (await controller.markets(iUSDx.address)).borrowPaused;
      // console.log("oldiUSDxBorrowPaused", oldiUSDxBorrowPaused);
      // let oldiUSDTRedeemPaused = (await controller.markets(iUSDT.address)).redeemPaused;
      // console.log("oldiUSDTRedeemPaused", oldiUSDTRedeemPaused);
      // let oldiUSDxTransferPaused = await controller.transferPaused();
      // console.log("oldiUSDxTransferPaused", oldiUSDxTransferPaused);
      // let oldiUSDTSeizePaused = await controller.seizePaused();
      // console.log("oldiUSDTSeizePaused", oldiUSDTSeizePaused);

      let data = abiCoder.encode(["bool"], [paused]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setProtocolPaused(bool)",
        data
      );

      let newiUSDTMintPaused = (await controller.markets(iUSDT.address))
        .mintPaused;
      // console.log("newiUSDTMintPaused", newiUSDTMintPaused);
      let newiUSDxBorrowPaused = (await controller.markets(iUSDx.address))
        .borrowPaused;
      // console.log("newiUSDxBorrowPaused", newiUSDxBorrowPaused);
      let newiUSDTRedeemPaused = (await controller.markets(iUSDT.address))
        .redeemPaused;
      // console.log("newiUSDTRedeemPaused", newiUSDTRedeemPaused);
      let newiUSDxTransferPaused = await controller.transferPaused();
      // console.log("newiUSDxTransferPaused", newiUSDxTransferPaused);
      let newiUSDTSeizePaused = await controller.seizePaused();
      // console.log("newiUSDTSeizePaused", newiUSDTSeizePaused);

      expect(newiUSDTMintPaused).to.equal(paused);
      expect(newiUSDxBorrowPaused).to.equal(paused);
      expect(newiUSDTRedeemPaused).to.equal(paused);
      expect(newiUSDxTransferPaused).to.equal(paused);
      expect(newiUSDTSeizePaused).to.equal(paused);
    });

    it("Set a new price oracle", async function () {
      const [owner, ...accounts] = await ethers.getSigners();

      // let oldPriceOracle = await controller.priceOracle();
      // console.log("oldPriceOracle", oldPriceOracle);

      // Deploy a new oracle.
      const priceOracle = await fixtureDeployOracle(owner.getAddress(), "0.01");

      let data = abiCoder.encode(["address"], [priceOracle.address]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setPriceOracle(address)",
        data
      );

      let newPriceOracle = await controller.priceOracle();
      // console.log("newPriceOracle", newPriceOracle);

      expect(priceOracle.address).to.equal(newPriceOracle);
    });

    it("Set a new reward distributor", async function () {
      const [owner, ...accounts] = await ethers.getSigners();

      // let oldRewardDistributor = await controller.rewardDistributor();
      // console.log("oldRewardDistributor", oldRewardDistributor);

      const mockRewardDistributor = newiToken.address;

      let data = abiCoder.encode(["address"], [mockRewardDistributor]);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_setRewardDistributor(address)",
        data
      );

      let newRewardDistributor = await controller.rewardDistributor();
      // console.log("newRewardDistributor", newRewardDistributor);

      expect(mockRewardDistributor).to.equal(newRewardDistributor);
    });

    it("Set supply capacity and borrow capacity at the same time", async function () {
      // let oldSupplyCapacity = (await controller.markets(newiToken.address)).supplyCapacity;
      // console.log("oldSupplyCapacity", oldSupplyCapacity.toString());
      // let oldBorrowCapacity = (await controller.markets(newiToken.address)).borrowCapacity;
      // console.log("oldBorrowCapacity", oldBorrowCapacity.toString());

      let supplyCapacity = await parseTokenAmount(newiToken, "99999");
      let supplyCapacityData = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, supplyCapacity]
      );

      let borrowCapacity = await parseTokenAmount(newiToken, "99999");
      let borrowCapacityData = abiCoder.encode(
        ["address", "uint256"],
        [newiToken.address, borrowCapacity]
      );

      let targetsAddr = [controller.address, controller.address];
      let values = [0, 0];
      let signatures = [
        "_setSupplyCapacity(address,uint256)",
        "_setBorrowCapacity(address,uint256)",
      ];
      let datas = [supplyCapacityData, borrowCapacityData];

      await timelock.executeTransactions(
        targetsAddr,
        values,
        signatures,
        datas
      );

      let newSupplyCapacity = (await controller.markets(newiToken.address))
        .supplyCapacity;
      // console.log("newSupplyCapacity", newSupplyCapacity.toString());
      let newBorrowCapacity = (await controller.markets(newiToken.address))
        .borrowCapacity;
      // console.log("newBorrowCapacity", newBorrowCapacity.toString());

      expect(newSupplyCapacity).to.equal(supplyCapacity);
      expect(newBorrowCapacity).to.equal(borrowCapacity);
    });
  });
});
