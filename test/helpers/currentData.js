const {
  getBlock,
  increaseBlock,
  getiTokenCurrentData,
} = require("./fixtures.js");

const { divup } = require("./utils.js");

async function getBorrowBalanceCurrent(iToken, account, blockDelta) {
  let { borrowIndex } = await getiTokenCurrentData(iToken, blockDelta);

  let [principal, interestIndex] = await iToken.borrowSnapshot(account);

  // console.log(borrowIndex, principal, interestIndex);

  return divup(principal.mul(borrowIndex), interestIndex);
}

module.exports = { getBorrowBalanceCurrent };
