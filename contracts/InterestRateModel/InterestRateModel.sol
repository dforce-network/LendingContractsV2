// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

/**
 * @title dForce's lending InterestRateModel Contract
 * @author dForce
 */
contract InterestRateModel {
    using SafeMathUpgradeable for uint256;

    uint256 private constant BASE = 1e18;

    /**
     * @notice The approximate number of Ethereum blocks produced each year
     */
    uint256 public constant blocksPerYear = 2102400;

    /**
     * @notice Per block interest rate calculated based on utilization
     */
    uint256 public interestPerBlock;

    /**
     * @notice Basic interest rate per block
     */
    uint256 public baseInterestPerBlock;

    /**
     * @notice Per block interest rate at high utilization point
     */
    uint256 public highInterestPerBlock;

    /**
     * @notice High utilization
     */
    uint256 public high;

    /**
     * @notice Construct an interest rate model
     * @param _baseInterestPerYear Base annual interest rate, 18 decimal places
     * @param _interestPerYear Annual interest rate (based on utilization), 18 decimal places
     * @param _highInterestPerYear Annual interest rate at high utilization point, 18 decimal places
     * @param _high High utilization
     */
    constructor(
        uint256 _baseInterestPerYear,
        uint256 _interestPerYear,
        uint256 _highInterestPerYear,
        uint256 _high
    ) public {
        baseInterestPerBlock = _baseInterestPerYear.div(blocksPerYear);
        interestPerBlock = (_interestPerYear.mul(BASE)).div(
            blocksPerYear.mul(_high == 0 ? BASE : _high)
        );
        highInterestPerBlock = _highInterestPerYear.div(blocksPerYear);
        high = _high;
    }

    /*********************************/
    /******** Security Check *********/
    /*********************************/

    /**
     * @notice Ensure this is an interest rate model contract.
     */
    function isInterestRateModel() external pure returns (bool) {
        return true;
    }

    /**
     * @notice Calculate the utilization rate: `_borrows / (_cash + _borrows - _reserves)`
     * @param _cash Asset balance
     * @param _borrows Asset borrows
     * @param _reserves Asset reserves
     * @return Asset utilization [0, 1e18]
     */
    function utilizationRate(
        uint256 _cash,
        uint256 _borrows,
        uint256 _reserves
    ) internal pure returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (_borrows == 0) return 0;

        // Utilization rate is 100% when _grossSupply is less than or equal to borrows
        uint256 _grossSupply = _cash.add(_borrows);
        if (_grossSupply <= _reserves) return BASE;

        return _borrows.mul(BASE).div(_grossSupply.sub(_reserves));
    }

    /**
     * @notice Get the current borrow rate per block, 18 decimal places
     * @param _balance Asset balance
     * @param _borrows Asset borrows
     * @param _reserves Asset reserves
     * @return Current borrow rate per block, 18 decimal places
     */
    function getBorrowRate(
        uint256 _balance,
        uint256 _borrows,
        uint256 _reserves
    ) public view returns (uint256) {
        uint256 _util = utilizationRate(_balance, _borrows, _reserves);

        uint256 _high = high;
        if (_util <= _high) {
            return
                _util.mul(interestPerBlock).div(BASE).add(baseInterestPerBlock);
        } else {
            return
                _util.sub(_high).mul(highInterestPerBlock).div(BASE).add(
                    _high.mul(interestPerBlock).div(BASE).add(
                        baseInterestPerBlock
                    )
                );
        }
    }
}
