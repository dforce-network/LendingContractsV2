// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/**
 * @title dForce's ExchangeRateModel Contract
 * @author dForce
 * @notice Exchange rate models for interest-bearing assets or assets with fixed or dynamic exchange rates relative to the underlying asset
 */
abstract contract ExchangeRateModel {
    // scale between token and wrapped token
    function scale() external view virtual returns (uint256);

    // Asset underlying token address
    function token() external view virtual returns (address);

    // exchange rate between token and wrapped token
    function getExchangeRate() external view virtual returns (uint256);

    // Max swing in exchange rate interval time.
    function getMaxSwingRate(uint256 interval) external view virtual returns (uint256);

    // After the time of `_interval`, get the accmulator interest rate.
    function getFixedInterestRate(uint256 interval)
        external
        view
        virtual
        returns (uint256);

    // After the time of `_interval`, get exchange rate.
    function getFixedExchangeRate(uint256 interval)
        external
        view
        virtual
        returns (uint256);
}