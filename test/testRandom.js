const fs = require("fs");

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = require("ethers");
const {
  loadFixture,
  increaseBlock,
  fixtureDefault,
  getiTokenCurrentData,
} = require("./helpers/fixtures.js");

const {
  parseTokenAmount,
  formatTokenAmount,
  verifyAllowError,
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

const caseFile = "randomCases.txt";

let iUSDx, iUSDT, iWBTC, iETH, controller, interestRateModel;
let USDx, USDT, WBTC;
let xUSD, iMUSX, xEUR, iMEUX, iUSX, iEUX;
let xTSLA, ixTSLA, xAPPL, ixAPPL;
let msdController;
let users, owner;
let lendingData;
let oracle;
let delta;
let borrower = zeroAddress;
let userUnderlyingBalance;

let iMSDs = [];
let iMSDsUnderlyings = [];
// config
let randomTimes = 300;
// add tokens in the `init` function.
let allTokens = [];
// NOTICE: the zeroAddress(iETH) must be the last one in this array.
let underlyings = [];
// !!!NOTICE: Do not change the the order of `borrow`, `repay` and `repayBorrowBehalf`.!!!
let allActions = [
  "borrow",
  "repay",
  "repayBorrowBehalf",
  "mint",
  "redeem",
  "redeemUnderlying",
  "transfer",
];
let totalUsers = 10; // user1 ~ user9, needs to be less than 19
let maxBlocks = 100;
let maxAmount = 10000;
let baseAmount = 1000; // actual amount = max amount / base amount;

// generate a random number.
function random(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe("Random test", function () {
  async function init() {
    ({
      controller: controller,
      msdController: msdController,
      owner: owner,
      iToken0: iUSDx,
      underlying0: USDx,
      iToken1: iUSDT,
      underlying1: USDT,
      iToken2: iWBTC,
      underlying2: WBTC,
      iToken3: ixTSLA,
      underlying3: xTSLA,
      iToken4: ixAPPL,
      underlying4: xAPPL,
      iETH: iETH,
      xUSD: xUSD,
      iMUSX: iMUSX,
      xEUR: xEUR,
      iMEUX: iMEUX,
      interestRateModel: interestRateModel,
      accounts: users,
      priceOracle: oracle,
      lendingData: lendingData,
      iUSX: iUSX,
      iEUX: iEUX,
    } = await loadFixture(fixtureDefault));

    iUSDxDecimals = await iUSDx.decimals();
    iUSDTDecimals = await iUSDT.decimals();
    iWBTCDecimals = await iWBTC.decimals();
    ixTSLADecimals = await ixTSLA.decimals();
    ixAPPLDecimals = await ixAPPL.decimals();

    allTokens.push(iUSDx);
    underlyings.push(USDx);

    allTokens.push(iUSDT);
    underlyings.push(USDT);

    allTokens.push(iWBTC);
    underlyings.push(WBTC);

    allTokens.push(iMUSX);
    underlyings.push(xUSD);

    allTokens.push(iMEUX);
    underlyings.push(xEUR);

    // iMSDs.push(iUSX);
    // iMSDsUnderlyings.push(xUSD);

    // iMSDs.push(iEUX);
    // iMSDsUnderlyings.push(xEUR);

    allTokens.push(ixTSLA);
    underlyings.push(xTSLA);

    allTokens.push(ixAPPL);
    underlyings.push(xAPPL);

    allTokens.push(iETH);
    underlyings.push(zeroAddress);

    delta = 10000;

    await setOraclePrices(
      oracle,
      [iUSDx, iUSDT, iWBTC, ixTSLA, ixAPPL],
      [1, 1, 20000, 732, 132]
    );

    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < allTokens.length; j++) {
        await controller.connect(users[i]).enterMarkets([allTokens[j].address]);
      }

      // for (let m = 0; m < iMSDs.length; m++) {
      //   await controller.connect(users[i]).enterMarkets([iMSDs[m].address]);
      // }
    }

    // mine enough MSD token, and then distribute to others to `repay`
    // !!!NOTICE: user 16 has all enough tokens!!!
    // user16 supply enough to borrow iMSD.
    await iWBTC
      .connect(users[16])
      .mint(users[16].address, await parseTokenAmount(WBTC, "2000"));
  }

  describe("Prepare env", function () {
    it("init", async function () {
      await init();
      let caseDetails = [];
      for (let i = 0; i < allTokens.length; i++) {
        let iTokenContract = allTokens[i];
        let currentTokenIsiToken = await iTokenContract.isiToken();
        if (!currentTokenIsiToken) {
          let underlyingToken = underlyings[i];
          let mintMSDAmount = await parseTokenAmount(underlyingToken, "9000");
          await iTokenContract.connect(users[16]).borrow(mintMSDAmount);
          // distribute MSD.
          for (let j = 0; j < totalUsers; j++) {
            await underlyingToken
              .connect(users[j])
              .approve(iTokenContract.address, MAX);
          }
          await underlyingToken
            .connect(users[16])
            .approve(iTokenContract.address, MAX);
        }
      }

      // for (let i = 0; i < iMSDs.length; i++) {
      //   let iTokenContract = iMSDs[i];
      //   let underlyingToken = iMSDsUnderlyings[i];
      //   for (let j = 0; j < totalUsers; j++) {
      //     await underlyingToken.connect(users[j]).approve(iTokenContract.address, MAX);
      //   }
      // }

      // all users supply supporting tokens
      for (let i = 0; i < totalUsers; i++) {
        for (let j = 0; j < allTokens.length; j++) {
          let iToken = allTokens[j];
          let underlying = underlyings[j];
          let isiToken = await iToken.isiToken();
          if (isiToken) {
            caseDetails.push({
              user: users[i],
              borrower: users[i],
              action: "mint",
              asset: iToken,
              blockDelta: 10,
              underlying: underlying,
              amount: await parseTokenAmount(iToken, "3500"),
              isStableCoin: false,
              lendingData: lendingData,
              controller: controller,
              oracle: oracle,
            });
          }
        }
      }

      // all users borrow supporting tokens
      for (let i = 0; i < totalUsers; i++) {
        for (let j = 0; j < allTokens.length; j++) {
          let iToken = allTokens[j];
          let underlying = underlyings[j];
          caseDetails.push({
            user: users[i],
            borrower: users[i],
            action: "borrow",
            asset: iToken,
            blockDelta: 10,
            underlying: underlying,
            amount: await parseTokenAmount(iToken, "500"),
            isStableCoin: false,
            lendingData: lendingData,
            controller: controller,
            oracle: oracle,
          });
        }
      }
      // // all users supply iMSD token
      // for (let i = 0; i < totalUsers; i++) {
      //   for (let j = 0; j < iMSDs.length; j++) {
      //     let iToken = iMSDs[j];
      //     let underlying = iMSDsUnderlyings[j];
      //     caseDetails.push({
      //       user: users[i],
      //       borrower: users[i],
      //       action: "mint",
      //       asset: iToken,
      //       blockDelta: 10,
      //       underlying: underlying,
      //       amount: await parseTokenAmount(iToken, "500"),
      //       isStableCoin: false,
      //       lendingData: lendingData,
      //       controller: controller,
      //       oracle: oracle,
      //     });
      //   }
      // }
      // for (let i = 0; i < iMSDs.length; i++) {
      //   allTokens.push(iMSDs[i]);
      //   underlyings.push(iMSDsUnderlyings[i]);
      // }
      await executeOperations(caseDetails);
    });
  });

  describe("Generate random test cases", function () {
    it("generate and save cases", async function () {
      let caseDetails = [];
      for (let i = 0; i < randomTimes; i++) {
        let randomUserNum = random(1, totalUsers);
        let randomBlock = random(1, maxBlocks);
        let randomToken = random(0, allTokens.length);
        let randomAction = random(0, allActions.length);
        let randomAmount = random(1, maxAmount) / baseAmount;
        let iToken = allTokens[randomToken];
        let isiToken = await iToken.isiToken();
        if (!isiToken) {
          randomAction = randomAction % 2;
        }
        caseDetails.push({
          caseNum: i,
          userNum: randomUserNum,
          borrowerNum: randomUserNum == 0 ? totalUsers - 1 : randomUserNum - 1,
          block: randomBlock,
          token: randomToken,
          action: randomAction,
          amount: randomAmount,
        });
      }
      fs.writeFileSync(caseFile, JSON.stringify(caseDetails));
    });
  });

  describe("Run test cases", function () {
    let caseDetails = [];
    let caseData = fs.readFileSync(caseFile);
    let allCases = JSON.parse(caseData);
    let casesLength = allCases.length;
    for (let i = 0; i < casesLength; i++) {
      it("Read test case and then run", async function () {
        let currentCase = allCases[i];
        let randomUserNum = currentCase.userNum;
        let randomBorrowerNum = currentCase.borrowerNum;
        let randomBlock = currentCase.block;
        let randomToken = currentCase.token;
        let randomAction = currentCase.action;
        let randomAmount = currentCase.amount;
        let executionAmount = await parseTokenAmount(
          allTokens[randomToken],
          randomAmount.toString()
        );
        let user = users[randomUserNum];
        borrower = users[randomBorrowerNum];
        let iToken = allTokens[randomToken];
        let underlying = underlyings[randomToken];
        await increaseBlock(randomBlock);
        console.log("current operation times is: ", i);
        console.log("random block:    ", randomBlock);
        console.log("user number:     ", randomUserNum);
        console.log("borrower number: ", randomBorrowerNum);
        console.log("user action:     ", allActions[randomAction]);
        console.log("asset is:        ", await iToken.name());
        console.log("amount is:       ", randomAmount.toString(), "\n");
        if (allActions[randomAction] == "mint") {
          if (underlying == zeroAddress) {
            userUnderlyingBalance = await user.provider.getBalance(
              user.address
            );
          } else {
            userUnderlyingBalance = await underlying.balanceOf(user.address);
          }
          if (userUnderlyingBalance.sub(executionAmount).toString() < 0) {
            console.log("user do not have enough underlying", "\n");
            return;
          }
        } else if (allActions[randomAction] == "redeem") {
          let useriTokenBalance = await iToken.balanceOf(user.address);
          console.log(
            "user current iToken balance is: ",
            await formatTokenAmount(iToken, useriTokenBalance.toString())
          );
          if (useriTokenBalance.sub(executionAmount).toString() < 0) {
            console.log("user do not have enough iToken", "\n");
            return;
          }

          let withdrawCash = await iToken.callStatic.balanceOfUnderlying(
            user.address
          );
          let tokenLiquidity = await iToken.getCash();
          if (tokenLiquidity.sub(withdrawCash).toString() < 0) {
            console.log("market does not have enough liquidity", "\n");
            return;
          }
        } else if (allActions[randomAction] == "redeemUnderlying") {
          let userUnderlyingBalance = await iToken.callStatic.balanceOfUnderlying(
            user.address
          );
          console.log(
            "user underlying token balance is: ",
            userUnderlyingBalance.toString()
          );
          if (userUnderlyingBalance.sub(executionAmount).toString() < 0) {
            console.log("user withdraws underlying too much", "\n");
            return;
          }

          let tokenLiquidity = await iToken.getCash();
          console.log("iToken liquidity is: ", tokenLiquidity.toString(), "\n");
          if (tokenLiquidity.sub(executionAmount).toString() < 0) {
            console.log("market does not have enough liquidity", "\n");
            return;
          }
        } else if (allActions[randomAction] == "borrow") {
          let accountBorrowData = await lendingData.callStatic.getAccountBorrowDataForTest(
            iToken.address,
            user.address,
            ethers.utils.parseEther("0.8")
          );
          let availableBorrow = accountBorrowData[1];
          console.log("max borrow amount is: ", availableBorrow.toString());
          if (availableBorrow.sub(executionAmount).toString() < 0) {
            console.log("user does not have enough equity", "\n");
            return;
          }
        } else if (allActions[randomAction] == "repay") {
          let userUnderlyingBalance;
          if (underlying == zeroAddress) {
            userUnderlyingBalance = await user.provider.getBalance(
              user.address
            );
          } else {
            userUnderlyingBalance = await underlying.balanceOf(user.address);
          }
          if (userUnderlyingBalance.sub(executionAmount).toString() < 0) {
            console.log("user do not have enough underlying", "\n");
            return;
          }

          let userBorrowed = await iToken.callStatic.borrowBalanceCurrent(
            user.address
          );
          console.log("user borrowed amount is: ", userBorrowed.toString());
          if (userBorrowed.sub(executionAmount).toString() < 0) {
            console.log("user tries to repay too much", "\n");
            return;
          }
        } else if (allActions[randomAction] == "repayBorrowBehalf") {
          let userUnderlyingBalance;
          if (underlying == zeroAddress) {
            userUnderlyingBalance = await user.provider.getBalance(
              user.address
            );
          } else {
            userUnderlyingBalance = await underlying.balanceOf(user.address);
            console.log(
              "user underlying balance:  ",
              userUnderlyingBalance.toString()
            );
          }
          if (userUnderlyingBalance.sub(executionAmount).toString() < 0) {
            console.log("payer do not have enough underlying", "\n");
            return;
          }

          let userBorrowed = await iToken.callStatic.borrowBalanceCurrent(
            borrower.address
          );
          console.log("borrower borrowed amount is: ", userBorrowed.toString());
          if (userBorrowed.sub(executionAmount).toString() < 0) {
            console.log("payer tries to repay too much", "\n");
            return;
          }
        } else if (allActions[randomAction] == "transfer") {
          let useriTokenBalance = await iToken.balanceOf(user.address);
          if (useriTokenBalance.sub(executionAmount).toString() < 0) {
            console.log("executor tries to transfer too much", "\n");
            return;
          }
        }

        caseDetails = [
          {
            user: user,
            borrower: borrower,
            action: allActions[randomAction],
            asset: iToken,
            blockDelta: randomBlock,
            underlying: underlying,
            amount: executionAmount,
            isStableCoin: false,
            lendingData: lendingData,
            controller: controller,
            oracle: oracle,
          },
        ];
        await executeOperations(caseDetails);
      });
    }
  });

  describe("Try to return to the original state", function () {
    it("repay and withdraw all", async function () {
      // loop all users
      for (let i = 0; i < totalUsers; i++) {
        let user = users[i];
        console.log("current user is: ", i);
        // loop all assets to repay
        for (let j = 0; j < allTokens.length; j++) {
          let iToken = allTokens[j];
          let isiToken = await iToken.isiToken();
          let underlyingToken = underlyings[j];
          console.log("current iToken is: ", (await iToken.name()).toString());
          // check borrowed amount
          let borrowedAmount = await iToken.borrowBalanceStored(user.address);
          console.log(
            "user borrowed amount is: ",
            borrowedAmount.toString(),
            "\n"
          );
          if (borrowedAmount.toString() > 0) {
            if (underlyingToken == zeroAddress) {
              let repayAmount = borrowedAmount.add(BASE);
              let userBalance = await user.provider.getBalance(user.address);
              if (userBalance.sub(repayAmount) > 0) {
                await iToken.connect(user).repayBorrow({ value: repayAmount });
              } else {
                // !!!NOTICE: user 16 has all enough tokens!!!
                await iToken
                  .connect(users[16])
                  .repayBorrowBehalf(user.address, { value: repayAmount });
              }
            } else {
              let userBalance = await underlyingToken.balanceOf(user.address);
              console.log("user balance is: ", userBalance.toString());
              if (isiToken) {
                // repay all borrowed iToken.
                if (userBalance.sub(borrowedAmount) > 0) {
                  console.log("user repay by himself");
                  await iToken.connect(user).repayBorrow(MAX);
                } else {
                  console.log("user repay by others");
                  await iToken
                    .connect(users[16])
                    .repayBorrowBehalf(user.address, MAX);
                }
              } else {
                // repay has borrowed iMSD without interest.
                await iToken.connect(user).repayBorrow(userBalance);
                // repay all by ohters.
                await iToken
                  .connect(users[16])
                  .repayBorrowBehalf(user.address, MAX);
              }
              expect(await iToken.borrowBalanceStored(user.address)).to.equal(
                0
              );
            }
            console.log(
              "after repay, user borrowed amount is: ",
              (await iToken.borrowBalanceStored(user.address)).toString(),
              "\n"
            );
          }
        }

        let userBorrowedAssets = await controller.getBorrowedAssets(
          user.address
        );
        expect(userBorrowedAssets.length).to.equal(0);
      }

      for (let i = 0; i < totalUsers; i++) {
        let user = users[i];
        console.log("current user is: ", i);
        // loop all assets to withdraw
        for (let j = 0; j < allTokens.length; j++) {
          let iToken = allTokens[j];
          let isiToken = await iToken.isiToken();
          let underlyingToken = underlyings[j];
          if (!isiToken) {
            let user16Balance = await underlyingToken.balanceOf(
              users[16].address
            );
            await iToken.connect(users[16]).repayBorrow(user16Balance);
            continue;
          }
          // check supply amount
          let suppliedAmount = await iToken.balanceOf(user.address);
          console.log("current token is:  ", (await iToken.name()).toString());
          console.log("user supplied amount is: ", suppliedAmount.toString());
          if (suppliedAmount.toString() > 0) {
            await iToken.connect(user).redeem(user.address, suppliedAmount);
            expect(await iToken.balanceOf(user.address)).to.equal(0);
          }
          console.log(
            "after withdraw, user supplied amount is: ",
            (await iToken.balanceOf(user.address)).toString(),
            "\n"
          );
        }
      }

      // loop all assets
      for (let j = 0; j < allTokens.length; j++) {
        let iToken = allTokens[j];
        let underlyingToken = underlyings[j];
        let isiToken = await iToken.isiToken();
        // check the final data
        console.log("current iToken is:   ", (await iToken.name()).toString());
        console.log(
          "iToken totalSupply:  ",
          (await iToken.totalSupply()).toString()
        );
        let iTokenCash = await iToken.getCash();
        console.log("iToken total cash:   ", iTokenCash.toString());
        // Update interests.
        await iToken.connect(users[16]).updateInterest();
        let iTokenTotalBorrows = await iToken.totalBorrows();
        console.log("iToken totalBorrows: ", iTokenTotalBorrows.toString());
        let iTokenTotalReserves;
        if (isiToken) {
          iTokenTotalReserves = await iToken.totalReserves();
          console.log("iToken totalReserve: ", iTokenTotalReserves.toString());
          expect(iTokenTotalBorrows.add(iTokenCash)).to.gt(iTokenTotalReserves);
        } else {
          let iMSDTotalReserves = (
            await msdController.callStatic.calcEquity(underlyingToken.address)
          )[0];
          console.log("iMSD totalReserve:   ", iMSDTotalReserves.toString());
          expect(iMSDTotalReserves).to.equal(iTokenTotalBorrows);
        }
        console.log("\n");
      }
    });
  });
});
