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
  fixtureDeployController,
  fixtureDeployStablecoinInterestRateModel,
} = require("../helpers/fixtures.js");
const { parseTokenAmount } = require("../helpers/utils.js");

const zeroAddress = ethers.constants.AddressZero;
const MAX = ethers.constants.MaxUint256;
const BASE = utils.parseEther("1");
const ZERO = ethers.BigNumber.from("0");
const blocksPerYear = ethers.BigNumber.from("2102400");

const abiCoder = new ethers.utils.AbiCoder();

let iUSDx, iUSDT, iWBTC, iETH, controller, interestRateModel;
let USDx, USDT, WBTC;
let accounts, user1, user2, user3, owner;
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

let rewardDistributor, newController, newInterestModelRate;
let timelock;
let newiToken;

describe("Governance Proposal Examination", function () {
    const rawMintAmount = ethers.BigNumber.from("500");

    async function init() {
        ({
        controller: controller,
        rewardDistributor: rewardDistributor,
            owner: owner,
            accounts: accounts,
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
        [user1, user2, user3] = accounts;

        // Deploy the governance contract
        const Timelock = await ethers.getContractFactory("Timelock");
        timelock = await Timelock.connect(user1).deploy();
        await timelock.deployed();

        console.log("timelock", timelock.address);
        console.log("timelock owner", await timelock.owner());
        console.log("user1 is: ", user1.address);
    }

    describe("Test goverance contract", function () {
        before("Transfer controller contract owner to timelock contract", async function () {
            await init();
            // transfer ownership of iToken contract to governance contract
            await controller._setPendingOwner(timelock.address);
            console.log("controller original owner is: ", await controller.owner());

            await timelock.connect(user1).executeTransaction(
                controller.address,
                0,
                "_acceptOwner()",
                "0x"
            );
            let controllerOwner = await controller.owner();
            console.log("controller new owner is: ", controllerOwner);
            expect(controllerOwner).to.equal(timelock.address);

        });

        it("Use timelock contract to set a new borrow capacity in controller contract", async function () {
            let borrowCapacity = await parseTokenAmount(iMUSX, "7545");
            // let oldBorrowCapacity = (await controller.markets(iMUSX.address)).borrowCapacity;
            // console.log("oldBorrowCapacity", oldBorrowCapacity.toString());

            let data = abiCoder.encode(
                ["address", "uint256"],
                [iMUSX.address, borrowCapacity]
            );

            await timelock.executeTransaction(
                controller.address,
                0,
                "_setBorrowCapacity(address,uint256)",
                data
            );

            let newBorrowCapacity = (await controller.markets(iMUSX.address))
                .borrowCapacity;
            // console.log("newBorrowCapacity", newBorrowCapacity.toString());

            expect(newBorrowCapacity).to.equal(borrowCapacity);
        });

        it("Revert when not timelock owner call function in timelock contract", async function () {
            let borrowCapacity = await parseTokenAmount(iMUSX, "7545");
            // let oldBorrowCapacity = (await controller.markets(iMUSX.address)).borrowCapacity;
            // console.log("oldBorrowCapacity", oldBorrowCapacity.toString());

            let data = abiCoder.encode(
                ["address", "uint256"],
                [iMUSX.address, borrowCapacity]
            );

            let timelockOwner = await timelock.owner();
            expect(timelockOwner).to.be.not.equal(user3.address);

            await expect(
                timelock.connect(user3).executeTransaction(
                    controller.address,
                    0,
                    "_setBorrowCapacity(address,uint256)",
                    data
                )
            ).to.be.revertedWith("onlyOwner: caller is not the owner");
        });

        it("Transfer controller contract ownership from timelock contract to a new account", async function () {
            console.log("controller original owner is: ", await controller.owner());
            let data = abiCoder.encode(
                ["address"],
                [user2.address]
            );
            await timelock.connect(user1).executeTransaction(
                controller.address,
                0,
                "_setPendingOwner(address)",
                data
            );

            await controller.connect(user2)._acceptOwner();
            console.log("controller new owner is: ", await controller.owner());
            console.log("user2 address is: ", user2.address);
        });
    });
});
