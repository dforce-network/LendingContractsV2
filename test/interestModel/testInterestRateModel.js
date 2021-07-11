const { expect } = require("chai");
const { utils } = require("ethers");
const { fixtureDeployInterestRateModel } = require("../helpers/fixtures.js");

let blocksPerYear;

const data = [
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 100,
    high: 80,
    points: [
      [0, 10],
      [10, 12.5],
      [79, 29.75],
      [80, 30],
      [81, 31],
      [100, 50],
    ],
  },
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 20,
    high: 90,
    points: [
      [0, 10],
      [10, 12.22],
      [100, 32],
    ],
  },
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 0,
    high: 90,
    points: [
      [0, 10],
      [10, 12.22],
      [100, 30],
    ],
  },
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 0,
    high: 110,
    points: [
      [0, 10],
      [10, 11.82],
      [100, 28.18],
    ],
  },
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 2000,
    high: 110,
    points: [
      [0, 10],
      [10, 11.82],
      [100, 28.18],
      [109, 29.82],
      [110, 30],
      [130, 430],
    ],
  },
  {
    baseRate: 10,
    interestRate: 20,
    highRate: 2000,
    high: 0,
    points: [
      [0, 10],
      [10, 210],
      [100, 2010],
    ],
  },
];

function randomNum(minNum, maxNum) {
  switch (arguments.length) {
    case 1:
      return parseInt(Math.random() * minNum + 1, 10);
    case 2:
      return parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10);
    default:
      return 0;
  }
}

function getUtilizationRate(util) {
  if (util == 0)
    return {
      cash: utils.parseEther("0"),
      borrows: utils.parseEther("0"),
      reserves: utils.parseEther("0"),
    };

  let borrows = utils.parseEther(util.toString());
  let totalAmount = utils.parseEther("100");
  if (util > 100) {
    cash = utils.parseEther(randomNum(0, 100).toString());
    reserves = borrows.sub(totalAmount).add(cash);
  } else {
    reserves = utils.parseEther(randomNum(0, 100).toString());
    cash = totalAmount.sub(borrows).add(reserves);
  }

  return {
    cash: cash,
    borrows: borrows,
    reserves: reserves,
  };
}

describe("InterestRateModel", function () {
  describe("chosen points", () => {
    data.forEach(({ baseRate, interestRate, highRate, high, points }) => {
      describe(`for baseRate=${baseRate}, interestRate=${interestRate}, highRate=${highRate}, high=${high}`, function () {
        let interestRateModel;

        before(async () => {
          interestRateModel = await fixtureDeployInterestRateModel(
            baseRate / 100,
            interestRate / 100,
            highRate / 100,
            high / 100
          );
          blocksPerYear = await interestRateModel.blocksPerYear();
          expect(await interestRateModel.isInterestRateModel()).to.equal(true);
        });

        points.forEach(([utilizationRate, expected]) => {
          it(`and utilizationRate=${utilizationRate}%`, async function () {
            const { cash, borrows, reserves } = getUtilizationRate(
              utilizationRate
            );
            const borrowRate = await interestRateModel.getBorrowRate(
              cash,
              borrows,
              reserves
            );
            const actual = borrowRate.mul(blocksPerYear).toString() / 1e16;
            console.log(`actual:    ${actual}`);
            console.log(`expected:  ${expected}\n`);

            expect(Math.abs(actual - expected) <= 0.01).to.equal(true);
          });
        });
      });
    });
  });
});
