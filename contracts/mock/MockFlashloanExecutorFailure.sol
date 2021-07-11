//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract FlashloanExecutorFailure {
    receive() external payable {}

    function executeOperation(
        address reserve,
        uint256 amount,
        uint256 fee,
        bytes memory data
    ) external {
        data;
        fee;

        if (reserve == address(0)) {
            (bool success, ) = msg.sender.call{ value: amount }("");
            require(success, "Contract execution Failed");
        } else {
            IERC20Upgradeable token = IERC20Upgradeable(reserve);
            require(
                token.balanceOf(address(this)) >= amount,
                "executeOperation: Flashloan do not get enough cash!"
            );

            //
            // Execute actions by your own strategy at here.
            //

            uint256 returnAmountWithFee = amount;
            token.transfer(msg.sender, returnAmountWithFee);
        }
    }
}
