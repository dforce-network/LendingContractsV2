//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IControllerDistributionInterface {
    function updateDistributionSpeed() external;
}

contract UpdateDistributionSpeedCaller {
    function call(address controller) public {
        IControllerDistributionInterface(controller).updateDistributionSpeed();
    }
}
