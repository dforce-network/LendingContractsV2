// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

/**
 * @title dForce's lending MockInterestRateModel Contract
 * @author dForce
 */
contract MockInterestRateModel {
    /**
     * @notice Ensure this is an interest rate model contract.
     */
    bool public isInterestRateModel;

    /**
     * @notice Construct an interest rate model
     */
    constructor() public {}

    /**
     * @dev Set a boolean value for the interest rate model.
     */
    function setIsInterestRateModel(bool _isInterestRateModel) external {
        isInterestRateModel = _isInterestRateModel;
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
    ) public pure returns (uint256) {
        _balance;
        _borrows;
        _reserves;
        return 0.01e18;
    }
}
