const { expect } = require("chai");
const { utils, ethers } = require("ethers");
const { fixtureDeployStablecoinInterestRateModel } = require("../helpers/fixtures.js");

const calcBase = (ethers.BigNumber.from("10")).pow(16);
const BASE = ethers.utils.parseUnits("1");
let blocksPerYear;

const {
    loadFixture,
    fixtureDefault,
} = require("../helpers/fixtures.js");

const {
    parseTokenAmount,
    verifyAllowError,
} = require("../helpers/utils.js");

let stablecoinInterest;
let users;
let USDx, iUSDx, USDT, iUSDT, controller;

describe("stablecoin interest rate model", async function () {
    async function init() {
        return ({
            controller: controller,
            iToken0: iUSDx,
            accounts: users,
            underlying0: USDx,
            iToken1: iUSDT,
            underlying1: USDT,
        } = await loadFixture(fixtureDefault));
    }

    function calculateBorrowRate(ur) {
        let factor = ethers.BigNumber.from("5");
        ur = (ethers.BigNumber.from(ur.toString())).mul(calcBase);
        return factor.mul(ur.pow(2).div(BASE.pow(1)).add(ur.pow(4).div(BASE.pow(3))).add(ur.pow(7).div(BASE.pow(6))).add(ur.pow(32).div(BASE.pow(31)).mul(2))).div(100).div(blocksPerYear);
    }

    describe("check borrow rate", function () {
        it("init", async function () {
            await init();
            stablecoinInterest = await fixtureDeployStablecoinInterestRateModel();
            blocksPerYear = await stablecoinInterest.blocksPerYear();
        });
        for (let i = 0; i <= 100; i++) {
            it(`when ur is ${i}%`, async function () {
                let borrows = i;
                let cash = 100 - i;
                let reserves = 0;
                let borrowRate = await stablecoinInterest.getBorrowRate(cash, borrows, reserves);
                // console.log("borrowRate ", borrowRate.toString());
                let calcResult = calculateBorrowRate(i);
                // console.log("calcResult", calcResult.toString());
                expect(borrowRate.sub(calcResult)).to.lte(1);
            });
        }
    });

    describe("check supply rate", function () {
        for (let i = 0; i <= 100; i++) {
            it(`when ur is ${i}%`, async function () {
                await init();
                let supplyUSDxAmount = await parseTokenAmount(iUSDx, "100");
                let supplyUSDTAmount = await parseTokenAmount(iUSDT, "100");
                let reserveRatio = "0.02";
                await USDx.connect(users[0]).approve(iUSDx.address, await parseTokenAmount(iUSDx, "99999"));
                await USDT.connect(users[0]).approve(iUSDx.address, await parseTokenAmount(iUSDT, "99999"));
                await iUSDx.connect(users[0]).mint(users[0].address, supplyUSDxAmount);
                await iUSDT.connect(users[0]).mint(users[0].address, supplyUSDTAmount);
                await controller.connect(users[0]).enterMarkets([iUSDx.address, iUSDT.address]);
                await iUSDx._setNewReserveRatio(await parseTokenAmount(iUSDx, reserveRatio));
                // replace interest rate model
                stablecoinInterest = await fixtureDeployStablecoinInterestRateModel();
                await iUSDx._setInterestRateModel(stablecoinInterest.address);

                // get borrow rate
                let borrows = i;
                let cash = 100 - i;
                let reserves = 0;
                let borrowRate = await stablecoinInterest.getBorrowRate(cash, borrows, reserves);

                // when exchange rate is equal to 1.
                let borrowAmount = await parseTokenAmount(iUSDx, i.toString());
                await iUSDx.connect(users[0]).borrow(borrowAmount);
                let supplyRate = await iUSDx.supplyRatePerBlock();
                let actualSupplyRate = supplyRate.mul(ethers.BigNumber.from(blocksPerYear.toString()));
                // console.log("supplyRate ", actualSupplyRate.toString());
                let calcSupplyRate = borrowRate.mul(ethers.BigNumber.from(blocksPerYear.toString())).mul(ethers.BigNumber.from((i*10**18).toString())).mul(ethers.BigNumber.from(((1-reserveRatio)*10**18).toString())).div(BASE).div(BASE).div(100)
                // console.log("calc supply", calcSupplyRate.toString());

                let delta = 0.00001;
                verifyAllowError(
                    actualSupplyRate,
                    calcSupplyRate,
                    delta
                );
            });
        }
    });
});
