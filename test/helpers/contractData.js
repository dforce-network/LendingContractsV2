const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  parseTokenAmount,
  verifyAllowError,
  formatTokenAmount,
  divup,
  rdivup,
} = require("./utils.js");
const {
  getBlock,
  increaseBlock,
  getiTokenCurrentData,
} = require("./fixtures.js");
const { formatEther } = require("ethers/lib/utils");

const BASE = ethers.utils.parseEther("1");
const ZERO = ethers.BigNumber.from(0);
const zeroAddress = ethers.constants.AddressZero;

// Get current contract data.
async function checkContractData(data) {
  let isBefore = data.isBefore;
  let iToken = data.iToken;
  let underlying = data.underlying;
  let spender = data.from;
  let recipient = data.to;
  if (isBefore) {
    await iToken.exchangeRateCurrent();
    let beforeTotalSupply = await iToken.totalSupply();
    let beforeCash = await iToken.getCash();
    let beforeTotalBorrow = await iToken.totalBorrows();
    let beforeSpenderUnderlyingBalance = await underlying.balanceOf(spender);
    let beforeSpenderiTokenBalance = await iToken.balanceOf(spender);
    let beforeRecipientUnderlyingBalance = await underlying.balanceOf(
      recipient
    );
    let beforeRecipientiTokenBalance = await iToken.balanceOf(recipient);
    let beforeBorrowBalance = await iToken.borrowBalanceStored(spender);
    let beforeBehalfBorrowBalance = await iToken.borrowBalanceStored(recipient);
    return {
      beforeTotalSupply: beforeTotalSupply,
      beforeCash: beforeCash,
      beforeTotalBorrow: beforeTotalBorrow,
      beforeSpenderUnderlyingBalance: beforeSpenderUnderlyingBalance,
      beforeSpenderiTokenBalance: beforeSpenderiTokenBalance,
      beforeRecipientUnderlyingBalance: beforeRecipientUnderlyingBalance,
      beforeRecipientiTokenBalance: beforeRecipientiTokenBalance,
      beforeBorrowBalance: beforeBorrowBalance,
      beforeBehalfBorrowBalance: beforeBehalfBorrowBalance,
      iToken: iToken,
      from: spender,
      to: recipient,
      underlying: underlying,
    };
  } else if (data.functionName == "redeem") {
    let exchangeRate = await iToken.exchangeRateStored();
    let afterTotalSupply = await iToken.totalSupply();
    let afterCash = await iToken.getCash();
    let afterSpenderiTokenBalance = await iToken.balanceOf(spender);
    let afterRecipientUnderlyingBalance = await underlying.balanceOf(recipient);

    let underlyingChanged = Number(
      data.redeemAmount.mul(exchangeRate).div(BASE).toString()
    );
    let delta = 10000;

    expect(
      data.beforeSpenderiTokenBalance.sub(afterSpenderiTokenBalance)
    ).to.equal(data.redeemAmount);

    expect(
      Number(
        afterRecipientUnderlyingBalance
          .sub(data.beforeRecipientUnderlyingBalance)
          .toString()
      )
    ).to.closeTo(underlyingChanged, delta);

    expect(data.beforeTotalSupply.sub(afterTotalSupply)).to.equal(
      data.redeemAmount
    );

    expect(Number(data.beforeCash.sub(afterCash).toString())).to.closeTo(
      underlyingChanged,
      delta
    );
  } else if (data.functionName == "redeemUnderlying") {
    let exchangeRate = await iToken.exchangeRateStored();
    let afterTotalSupply = await iToken.totalSupply();
    let afterCash = await iToken.getCash();
    let afterSpenderiTokenBalance = await iToken.balanceOf(spender);
    let afterRecipientUnderlyingBalance = await underlying.balanceOf(recipient);

    let iTokenChanged = Number(
      data.redeemAmount.mul(BASE).div(exchangeRate).toString()
    );
    let delta = 10000;

    expect(
      afterRecipientUnderlyingBalance.sub(data.beforeRecipientUnderlyingBalance)
    ).to.equal(data.redeemAmount);
    expect(
      Number(
        data.beforeSpenderiTokenBalance
          .sub(afterSpenderiTokenBalance)
          .toString()
      )
    ).to.closeTo(iTokenChanged, delta);

    expect(data.beforeCash.sub(afterCash)).to.equal(data.redeemAmount);
    expect(data.beforeTotalSupply.sub(afterTotalSupply)).to.equal(
      data.redeemAmount.mul(BASE).add(exchangeRate.sub(1)).div(exchangeRate)
    );
  } else if (data.functionName == "borrow") {
    let afterTotalBorrow = await iToken.totalBorrows();
    let afterSpenderUnderlyingBalance = await underlying.balanceOf(spender);
    let afterBorrowBalance = await iToken.borrowBalanceStored(spender);

    expect(afterBorrowBalance.sub(data.beforeBorrowBalance)).to.equal(
      data.borrowAmount
    );
    expect(afterTotalBorrow.sub(data.beforeTotalBorrow)).to.equal(
      data.borrowAmount
    );
    expect(
      afterSpenderUnderlyingBalance.sub(data.beforeSpenderUnderlyingBalance)
    ).to.equal(data.borrowAmount);
  } else if (data.functionName == "repay") {
    let afterTotalBorrow = await iToken.totalBorrows();
    let afterSpenderUnderlyingBalance = await underlying.balanceOf(spender);
    let afterBorrowBalance = await iToken.borrowBalanceStored(recipient);

    let borrowChanged = Number(
      data.beforeBehalfBorrowBalance.sub(afterBorrowBalance).toString()
    );
    let delta = 10000;

    expect(
      data.beforeSpenderUnderlyingBalance.sub(afterSpenderUnderlyingBalance)
    ).to.equal(data.repayAmount);
  }
}

async function getAccountEquity(controller, account) {
  let userEquity = await controller.calcAccountEquity(account);

  return {
    validBorrowed: userEquity[0],
    shortfall: userEquity[1],
    collateral: userEquity[2],
    borrowed: userEquity[3],
  };
}

async function getAccountTotalValue(lendingData, account) {
  let userData = await lendingData.callStatic.getAccountTotalValueForTest(account);

  return {
    totalSupplyBalanceValue: userData[0],
    collateralBalanceValue: userData[1],
    borrowBalanceValue: userData[2],
    healthyFactor: userData[3],
  };
}

async function getAccountBorrowData(
  lendingData,
  iToken,
  account,
  safeMaxFactor
) {
  let accountBorrowData = await lendingData.callStatic.getAccountBorrowDataForTest(
    iToken.address,
    account,
    safeMaxFactor
  );

  return {
    borrowBalance: accountBorrowData[0],
    availableBorrow: accountBorrowData[1],
    safeAvailableToBorrow: accountBorrowData[2],
    // underlying balance.
    accountBalance: accountBorrowData[3],
    maxRepay: accountBorrowData[4],
    decimals: accountBorrowData[5],
  };
}

async function getAccountSupplyInfo(
  lendingData,
  iToken,
  account,
  safeMaxFactor
) {
  let accountSupplyInfo = await lendingData.callStatic.getAccountSupplyInfo(
    iToken.address,
    account,
    safeMaxFactor
  );

  return {
    supplyBalanceValue: accountSupplyInfo[0],
  };
}

async function getAccountSupplyData(
  lendingData,
  iToken,
  account,
  safeMaxFactor
) {
  let accountSupplyData = await lendingData.callStatic.getAccountSupplyDataForTest(
    iToken.address,
    account,
    safeMaxFactor
  );

  return {
    supplyBalanceValue: accountSupplyData[0],
    underlyingBalance: accountSupplyData[1],
    maxSupplyAmount: accountSupplyData[2],
    availableToWithdraw: accountSupplyData[3],
    safeAvailableToWithdraw: accountSupplyData[4],
    iTokenBalance: accountSupplyData[5],
    iTokenDecimals: accountSupplyData[6],
  };
}

async function getSupplyAPY(lendingData, iToken) {
  let result = await lendingData.getSupplyTokenData(iToken.address);
  return {
    supplyAPY: result[0],
  };
}

async function getBorrowAPY(lendingData, iToken) {
  let result = await lendingData.getBorrowTokenData(iToken.address);
  return {
    borrowAPY: result[2],
  };
}

async function getAllData(
  oracle,
  controller,
  lendingData,
  account,
  iToken,
  isStableCoin,
  safeFactor
) {
  let price;
  let tokenDecimals = await iToken.decimals();
  if (isStableCoin) {
    price = ethers.BigNumber.from("1");
  } else {
    price = ethers.utils
      .parseEther("1")
      .mul(ethers.BigNumber.from("10").pow(18 - tokenDecimals))
      .div(await oracle.getUnderlyingPrice(iToken.address));
  }
  let accountiTokenBalance = await iToken.balanceOf(account);
  let accountiTokenBalanceValue = accountiTokenBalance.mul(price);
  let iTokenLiquidity = await iToken.getCash();
  let totalSupply = await iToken.totalSupply();

  const {
    // collateral - borrowed
    validBorrowed,
    // borrowed -collateral
    shortfall,
    collateral,
    borrowed,
  } = await getAccountEquity(controller, account);

  const {
    // all supply assets * its price
    totalSupplyBalanceValue,
    // all assets as collateral * its price
    collateralBalanceValue,
    // all assets as borrowed * its price
    borrowBalanceValue,
    // collateralBalance / borrowBalance
    healthyFactor,
  } = await getAccountTotalValue(lendingData, account);

  // const {
  //   supplyBalanceValue
  // } = await getAccountSupplyInfo(lendingData, iToken, account, safeFactor);

  const {
    supplyBalanceValue,
    underlyingBalance,
    maxSupplyAmount,
    availableToWithdraw,
    safeAvailableToWithdraw,
    iTokenBalance,
    iTokenDecimals,
  } = await getAccountSupplyData(lendingData, iToken, account, safeFactor);

  const {
    borrowBalance,
    availableBorrow,
    safeAvailableToBorrow,
    accountBalance,
    maxRepay,
    decimals,
  } = await getAccountBorrowData(lendingData, iToken, account, safeFactor);

  return {
    accountiTokenBalance,
    accountiTokenBalanceValue,
    iTokenLiquidity,
    totalSupply,
    validBorrowed,
    shortfall,
    collateral,
    borrowed,
    totalSupplyBalanceValue,
    collateralBalanceValue,
    borrowBalance,
    healthyFactor,
    borrowBalanceValue,
    availableBorrow,
    safeAvailableToBorrow,
    accountBalance,
    maxRepay,
    decimals,
    // getAccountSupplyData
    supplyBalanceValue,
    underlyingBalance,
    maxSupplyAmount,
    availableToWithdraw,
    safeAvailableToWithdraw,
    iTokenBalance,
    iTokenDecimals,
  };
}

async function afterExecutionData(iToken, underlying, user) {
  let currentExchangeRate = await iToken.exchangeRateStored();
  let afterUserUnderlyingBalance;
  if (underlying == zeroAddress) {
    afterUserUnderlyingBalance = await user.provider.getBalance(user.address);
  } else {
    afterUserUnderlyingBalance = await underlying.balanceOf(user.address);
  }
  let afterUseriTokenBalance = await iToken.balanceOf(user.address);
  let afterTotalSupply = await iToken.totalSupply();
  let afterTotalBorrows = await iToken.totalBorrows();
  let afterCash = await iToken.getCash();
  let afterTotalReserves = await iToken.totalReserves();
  let afterBorrowIndex = await iToken.borrowIndex();

  return {
    "underlying": afterUserUnderlyingBalance,
    "iToken": afterUseriTokenBalance,
    "supply": afterTotalSupply,
    "borrow": afterTotalBorrows,
    "cash": afterCash,
    "exchangeRate": currentExchangeRate,
    "reserve": afterTotalReserves,
    "borrowIndex": afterBorrowIndex,
  };
}

async function manuallyCheck(caseDetail, expectResults) {
  let result0, result1, result2;

  if (expectResults.length != 0) {
    hasExpectResult = true;
    result0 = expectResults[0];
    result1 = expectResults[1];
    result2 = expectResults[2];
  }
  // common data
  let iToken = caseDetail.asset;
  let underlying = caseDetail.underlying;
  let user = caseDetail.user;
  let actualAmount = caseDetail.amount;
  let isStableCoin = caseDetail.isStableCoin;
  let safeFactor = caseDetail.safeFactor
    ? caseDetail.safeFactor
    : ethers.utils.parseEther("0.8");
  let lendingDataContract = caseDetail.lendingData;
  let controllerContract = caseDetail.controller;
  let oracleContract = caseDetail.oracle;
  let interestRateModelContract = caseDetail.interestRateModel;

  let delta = 0.0001; // 10**-4

  let allDataOfUser1ForUSDx = await getAllData(
    oracleContract,
    controllerContract,
    lendingDataContract,
    result0.user.address,
    result0.asset,
    isStableCoin,
    safeFactor
  );
  // console.log("iToken is: ", await result0.asset.symbol(), "\n");

  // console.log("expect iToken balance is: ", await formatTokenAmount(result0.asset, result0.expectiTokenBalance));
  // console.log( "actual iToken balance is: ", await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.iTokenBalance),"\n");

  verifyAllowError(
    allDataOfUser1ForUSDx.iTokenBalance,
    result0.expectiTokenBalance,
    delta
  );

  // console.log("expect iToken balance value is: ", await formatTokenAmount(result0.asset, result0.expectiTokenTotalBalanceValue));
  // console.log("actual iToken balance value is: ", await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.totalSupplyBalanceValue), "\n");
  verifyAllowError(
    allDataOfUser1ForUSDx.totalSupplyBalanceValue,
    result0.expectiTokenTotalBalanceValue,
    delta
  );

  // console.log("expect collateral balance value is: ",await formatTokenAmount(result0.asset, result0.expectCollateralBalanceValue));
  // console.log("actual collateral balance value is: ",await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.collateralBalanceValue), "\n");

  verifyAllowError(
    allDataOfUser1ForUSDx.collateralBalanceValue,
    result0.expectCollateralBalanceValue,
    delta
  );

  // console.log("expect healthy factor is: ", await formatTokenAmount(result0.asset, result0.expectHealthyFactor) );
  // console.log("actual healthy factor is: ", await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.healthyFactor), "\n");

  verifyAllowError(
    allDataOfUser1ForUSDx.healthyFactor,
    result0.expectHealthyFactor,
    delta
  );

  // console.log("expect liquidity is: ", await formatTokenAmount(result0.asset, result0.expectLiquidity));
  // console.log("actual liquidity is: ", await formatTokenAmount(result0.asset,allDataOfUser1ForUSDx.iTokenLiquidity), "\n");

  verifyAllowError(
    allDataOfUser1ForUSDx.iTokenLiquidity,
    result0.expectLiquidity,
    delta
  );

  // console.log("expect max avaiable withdraw amount is: ", await formatTokenAmount(result0.asset, result0.expectMaxAvaiableWithdrawValue));
  // console.log("actual max avaiable withdraw anount is: ", await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.availableToWithdraw),"\n");
  verifyAllowError(
    allDataOfUser1ForUSDx.availableToWithdraw,
    result0.expectMaxAvaiableWithdrawValue,
    delta
  );

  // console.log("expect safe avaiable withdraw amount is: ", await formatTokenAmount(result0.asset, result0.expectMaxSafeAvaiableWithdrawValue));
  // console.log("actual safe avaiable withdraw anount is: ", await formatTokenAmount(result0.asset, allDataOfUser1ForUSDx.safeAvailableToWithdraw), "\n");

  verifyAllowError(
    allDataOfUser1ForUSDx.safeAvailableToWithdraw,
    result0.expectMaxSafeAvaiableWithdrawValue,
    delta
  );

  if (Object.keys(result1).length != 0) {
    let allDataOfUser1ForUSDT = await getAllData(
      oracleContract,
      controllerContract,
      lendingDataContract,
      result1.user.address,
      result1.asset,
      isStableCoin,
      safeFactor
    );
    // console.log("iToken is: ", await result1.asset.symbol(), "\n");

    // console.log("expect iToken borrowed balance is: ", await formatTokenAmount(result1.asset, result1.expectiTokenBorrowedBalance));
    // console.log("actual iToken borrowed balance is: ", await formatTokenAmount(result1.asset, allDataOfUser1ForUSDT.borrowBalance), "\n");

    verifyAllowError(
      allDataOfUser1ForUSDT.borrowBalance,
      result1.expectiTokenBorrowedBalance,
      delta
    );

    // console.log("expect iToken borrowed balance value is: ", await formatTokenAmount(result1.asset, result1.expectiTokenBorrowedBalanceValue));
    // console.log("actual iToken borrowed balance value is: ", await formatTokenAmount(result1.asset, allDataOfUser1ForUSDT.borrowBalanceValue), "\n");

    verifyAllowError(
      allDataOfUser1ForUSDT.borrowBalanceValue,
      result1.expectiTokenBorrowedBalanceValue,
      delta
    );

    // console.log("expect max avaiable borrow is: ", await formatTokenAmount(result1.asset, result1.expectMaxAvaiableBorrow));
    // console.log("actual max avaiable borrow is: ", await formatTokenAmount(result1.asset, allDataOfUser1ForUSDT.availableBorrow), "\n");

    verifyAllowError(
      allDataOfUser1ForUSDT.availableBorrow,
      result1.expectMaxAvaiableBorrow,
      delta
    );

    // console.log("expect safe avaiable borrow is: ", await formatTokenAmount(result1.asset, result1.expectSafeAvaiableBorrow));
    // console.log("actual safe avaiable borrow is: ", await formatTokenAmount(result1.asset, allDataOfUser1ForUSDT.safeAvailableToBorrow), "\n");

    verifyAllowError(
      allDataOfUser1ForUSDT.safeAvailableToBorrow,
      result1.expectSafeAvaiableBorrow,
      delta
    );

    // console.log("expect liquidity is: ", await formatTokenAmount(result1.asset, result1.expectLiquidity));
    // console.log("actual liquidity is: ", await formatTokenAmount(result1.asset, allDataOfUser1ForUSDT.iTokenLiquidity), "\n");

    verifyAllowError(
      allDataOfUser1ForUSDT.iTokenLiquidity,
      result1.expectLiquidity,
      delta
    );
  }

  if (Object.keys(result2).length != 0) {
    let allDataOfUser2ForUSDT = await getAllData(
      oracleContract,
      controllerContract,
      lendingDataContract,
      result2.user.address,
      result2.asset,
      isStableCoin,
      safeFactor
    );
    // console.log("iToken is: ", await result2.asset.symbol(), "\n");

    // console.log("expect iToken balance is: ", await formatTokenAmount(result2.asset, result2.expectiTokenBalance));
    // console.log("actual iToken balance is: ", await formatTokenAmount(result2.asset, allDataOfUser2ForUSDT.iTokenBalance), "\n");

    verifyAllowError(
      allDataOfUser2ForUSDT.iTokenBalance,
      result2.expectiTokenBalance,
      delta
    );

    // console.log("expect iToken balance value is: ", await formatTokenAmount(result2.asset, result2.expectiTokenTotalBalanceValue));
    // console.log("actual iToken balance value is: ", await formatTokenAmount(result2.asset, allDataOfUser2ForUSDT.supplyBalanceValue), "\n");

    verifyAllowError(
      allDataOfUser2ForUSDT.supplyBalanceValue,
      result2.expectiTokenTotalBalanceValue,
      delta
    );

    // console.log("expect collateral balance value is: ", await formatTokenAmount(result2.asset, result2.expectCollateralBalanceValue));
    // console.log("actual collateral balance value is: ", await formatTokenAmount(result2.asset, allDataOfUser2ForUSDT.collateralBalanceValue), "\n");

    verifyAllowError(
      allDataOfUser2ForUSDT.collateralBalanceValue,
      result2.expectCollateralBalanceValue,
      delta
    );

    // console.log("expect healthy factor is: ", await formatTokenAmount(result2.asset, result2.expectHealthyFactor));
    // console.log("actual healthy factor is: ", await formatTokenAmount(result2.asset, allDataOfUser2ForUSDT.healthyFactor), "\n");

    verifyAllowError(
      allDataOfUser2ForUSDT.healthyFactor,
      result2.expectHealthyFactor,
      delta
    );

    const { supplyAPY } = await getSupplyAPY(
      lendingDataContract,
      result2.asset
    );
    // console.log("usdt supply APY is: ", supplyAPY.toString());
    const { borrowAPY } = await getBorrowAPY(
      lendingDataContract,
      result2.asset
    );
    // console.log("usdt borrow APY is: ", borrowAPY.toString());
  }
}

async function callFunctions(action, underlying, iToken, executor, borrower, amount) {
  switch (action) {
    case "mint":
      if (underlying != zeroAddress) {
        await iToken.connect(executor).mint(executor.address, amount);
      } else {
        await iToken.connect(executor).mint(executor.address, { value: amount });
      }
      break;
    case "redeem":
      await iToken.connect(executor).redeem(executor.address, amount);
      break;
    case "redeemUnderlying":
      await iToken.connect(executor).redeemUnderlying(executor.address, amount);
      break;
    case "borrow":
      await iToken.connect(executor).borrow(amount);
      break;
    case "repay":
      if (underlying != zeroAddress) {
        await iToken.connect(executor).repayBorrow(amount);
      } else {
        await iToken.connect(executor).repayBorrow({ value: amount });
      }
      break;
    case "repayBorrowBehalf":
      if (underlying != zeroAddress) {
        await iToken.connect(executor).repayBorrowBehalf(borrower.address, amount);
      } else {
        await iToken.connect(executor).repayBorrowBehalf(borrower.address, { value: amount });
      }
      break;
    case "transfer":
      await iToken.connect(executor).transfer(borrower.address, amount);
      break;
  }
}

async function calculateResult(isiToken, action, amount, exchangeRate, underlying) {
  let expectBorrowedDelta, expectSuppliedDelta, expectUnderlyingDelta, expectiTokenDelta, expectCashDelta;
  switch (action) {
    case "mint":
      expectUnderlyingDelta = amount.mul(-1);
      expectiTokenDelta = amount.mul(BASE).div(exchangeRate);
      expectBorrowedDelta = ZERO;
      expectSuppliedDelta = expectiTokenDelta;
      expectCashDelta = amount;
      break;
    case "redeem":
      expectUnderlyingDelta = amount.mul(exchangeRate).div(BASE);
      expectiTokenDelta = amount.mul(-1);
      expectBorrowedDelta = ZERO;
      expectSuppliedDelta = amount.mul(-1);
      expectCashDelta = amount.mul(exchangeRate).div(BASE).mul(-1);
      break;
    case "redeemUnderlying":
      expectUnderlyingDelta = amount;
      expectiTokenDelta = rdivup(amount, exchangeRate).mul(-1);
      expectBorrowedDelta = ZERO;
      expectSuppliedDelta = rdivup(amount, exchangeRate).mul(-1);
      expectCashDelta = amount.mul(-1);
      break;
    case "borrow":
      expectUnderlyingDelta = amount;
      expectiTokenDelta = ZERO;
      expectBorrowedDelta = amount;
      expectSuppliedDelta = ZERO;
      expectCashDelta = amount.mul(-1);
      if (!isiToken) {expectCashDelta=ZERO}
      break;
    case "repay":
    case "repayBorrowBehalf":
      expectUnderlyingDelta = amount.mul(-1);
      expectiTokenDelta = ZERO;
      expectBorrowedDelta = amount.mul(-1);
      expectSuppliedDelta = ZERO;
      expectCashDelta = amount;
      if (!isiToken) {expectCashDelta=ZERO}
      break;
    case "transfer":
      expectUnderlyingDelta = ZERO;
      expectiTokenDelta = amount.mul(-1);
      expectBorrowedDelta = ZERO;
      expectSuppliedDelta = ZERO;
      expectCashDelta = ZERO;
      break;
  }

  return {
    "underlyingBalance": expectUnderlyingDelta,
    "iTokenBalance": expectiTokenDelta,
    "totalBorrows": expectBorrowedDelta,
    "totalSupply": expectSuppliedDelta,
    "totalCash": expectCashDelta,
    "underlyingToken": underlying,
    "action": action
  }
}

async function getBorrowedSnapshot(iToken, account) {
  return await iToken.borrowSnapshot(account.address);
}

async function executeOperations(caseDetails, expectResults = []) {
  const caseLength = caseDetails.length;
  let hasExpectResult = false;
  let delta = 50000;
  if (expectResults.length != 0) {
    hasExpectResult = true;
  }
  for (let i = 0; i < caseLength; i++) {
    let caseDetail = caseDetails[i];
    let expectResult = expectResults[i];
    let iToken = caseDetail.asset;
    let isiToken = await iToken.isiToken();
    let underlying = caseDetail.underlying;
    let executor = caseDetail.user;
    let borrower;
    let action = caseDetail.action;
    let actualAmount = caseDetail.amount;
    let blockDelta = caseDetail.blockDelta;
    let lendingData = caseDetail.lendingData;
    let controller = caseDetail.controller;
    let oracle = caseDetail.oracle;

    if (action == "repay") {
      borrower = executor;
    } else {
      borrower = caseDetail.borrower;
    }

    let beforeState = await getContractData(controller, iToken, underlying, executor);

    // calculate expected status
    const {
      totalReserves,
      borrowIndex,
      interestAccumulated,
    } = await getAccruedData(iToken, 1);

    let deltaResults;

    if (actualAmount.toString() == "0") {
      return;
    }
    await callFunctions(action, underlying, iToken, executor, borrower, actualAmount);

    let afterState = await getContractData(controller, iToken, underlying, executor);

    deltaResults = await calculateResult(isiToken, action, actualAmount, afterState.exchangeRate, underlying);


    if (action != 'transfer') {
      expect(totalReserves).to.equal(afterState.reserve);
      expect(borrowIndex).to.equal(afterState.borrowIndex);
    } else {
      expect(beforeState['equity']).to.gt(afterState['equity']);
    }


    let checkingKeies = ["underlyingBalance", "iTokenBalance", "totalBorrows", "totalSupply", "totalCash"];
    for (key of checkingKeies) {
      let actualInterestAccumulated = ZERO;
      if (deltaResults.underlyingToken == zeroAddress && key == "underlyingBalance") {
        verifyAllowError(
          (beforeState[key]).add(deltaResults[key]),
          afterState[key],
          delta
        );
        continue;
      }

      if (key == "totalBorrows" && action != 'transfer') {
        actualInterestAccumulated = interestAccumulated;
      }

      expect((beforeState[key]).add(actualInterestAccumulated).add(deltaResults[key])).to.equal(afterState[key]);

    }

    if (hasExpectResult) {
      await manuallyCheck(caseDetail, expectResults);
    }
  }
}

async function getContractData(controller, iToken, underlying, user) {
  let exchangeRate = await iToken.exchangeRateStored();
  let userUnderlyingBalance;
  if (underlying == zeroAddress) {
    userUnderlyingBalance = await user.provider.getBalance(user.address);
  } else {
    userUnderlyingBalance = await underlying.balanceOf(user.address);
  }
  let useriTokenBalance = await iToken.balanceOf(user.address);
  let totalSupply = await iToken.totalSupply();
  let totalBorrows = await iToken.totalBorrows();
  let cash = await iToken.getCash();
  let totalReserves = await iToken.totalReserves();
  let borrowIndex = await iToken.borrowIndex();
  let equity = (await controller.calcAccountEquity(user.address))[0];

  return {
    "underlyingBalance": userUnderlyingBalance,
    "iTokenBalance": useriTokenBalance,
    "totalSupply": totalSupply,
    "totalBorrows": totalBorrows,
    "totalCash": cash,
    "exchangeRate": exchangeRate,
    "reserve": totalReserves,
    "borrowIndex": borrowIndex,
    "equity": equity,
  };
}

async function getAccruedData(iTokenContract, increaseblock=0) {
  let accrualBlockNumber = ethers.BigNumber.from(await getBlock()).add(
    ethers.BigNumber.from(increaseblock)
  );
  let borrowRate = await iTokenContract.borrowRatePerBlock();
  let simpleInterestFactor = borrowRate.mul(
    accrualBlockNumber.sub(await iTokenContract.accrualBlockNumber())
  );

  let totalBorrows = await iTokenContract.totalBorrows();
  let base = ethers.utils.parseEther("1");
  let interestAccumulated = simpleInterestFactor.mul(totalBorrows).div(base);
  totalBorrows = interestAccumulated.add(totalBorrows);

  let totalReserves = await iTokenContract.totalReserves();
  let reserveRatio = await iTokenContract.reserveRatio();
  totalReserves = reserveRatio
    .mul(interestAccumulated)
    .div(base)
    .add(totalReserves);

  let borrowIndex = await iTokenContract.borrowIndex();
  borrowIndex = simpleInterestFactor
    .mul(borrowIndex)
    .div(base)
    .add(borrowIndex);

  let totalSupply = await iTokenContract.totalSupply();
  let cash = await iTokenContract.getCash();
  let exchangeRate =
    totalSupply.toString() == "0"
      ? base
      : cash.add(totalBorrows).sub(totalReserves).mul(base).div(totalSupply);

  return {
    cash,
    borrowRate,
    accrualBlockNumber,
    totalSupply,
    totalBorrows,
    totalReserves,
    exchangeRate,
    borrowIndex,
    interestAccumulated,
  };
}

module.exports = {
  checkContractData,
  executeOperations,
  getAllData,
  getAccountEquity,
  getAccountTotalValue,
  getAccountBorrowData,
  getAccountSupplyData,
  getSupplyAPY,
  getBorrowAPY,
};
