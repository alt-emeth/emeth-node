/**
 *Submitted for verification at Etherscan.io on 2021-08-01
*/

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library SafeMath {
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 c = a * b;
        assert(c / a == b);
        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a / b;
        return c;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        assert(b <= a);
        return a - b;
    }

    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        assert(c >= a);
        return c;
    }
}

abstract contract AssignerRole {
    address public assigner;

    constructor () {
        assigner = msg.sender;
    }

    modifier onlyAssigner() {
        require(isAssigner(msg.sender), "Assignable: msg.sender does not have the Assigner role");
        _;
    }

    function isAssigner(address _addr) public view returns (bool) {
        return (_addr == assigner);
    }

    function setAssigner(address _addr) public onlyAssigner {
        assigner = _addr;
    }
}

abstract contract VerifierRole {
    address public verifier;

    constructor () {
        verifier = msg.sender;
    }

    modifier onlyVerifier() {
        require(isVerifier(msg.sender), "Verifiable: msg.sender does not have the Verifier role");
        _;
    }

    function isVerifier(address _addr) public view returns (bool) {
        return (_addr == verifier);
    }

    function setVerifier(address _addr) public onlyVerifier {
        verifier = _addr;
    }
}

interface IERC20 {
    function balanceOf(address _owner) external view returns (uint256 balance);
    function transfer(address _to, uint256 _value) external returns (bool);
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
    function allowance(address _owner, address _spender) external view returns (uint256);
    function mint(address _to, uint256 _value) external returns (bool);
    function burn(uint256 _value) external returns (bool);
}

contract EmethCore is AssignerRole, VerifierRole {
    using SafeMath for uint256;

    // Constants
    uint256 constant REQUESTED = 0;
    uint256 constant ASSIGNED = 1;
    uint256 constant PROCESSING = 2;
    uint256 constant SUBMITTED = 3;
    uint256 constant VERIFIED = 4;
    uint256 constant REJECTED = 5;
    uint256 constant CANCELED = 6;
    uint256 constant TIMEOUT = 7;
    uint256 constant FAILED = 8;
    uint256 constant DECLINED = 9;

    // Paramters
    uint256 constant MAX_RETRY_COUNT = 5;
    uint256 constant TIMEOUT_PENALTY = 10000000000000000000; // 10 EMT
    uint256 public constant MIN_DEPOSIT = 1000000000000000000000; // 10,000 * 0.1 EMT = 1,000 EMT
    uint256 public constant DEPOSIT_PER_CAPACITY = 100000000000000000; // 0.1 EMT
    uint256 public MAX_SLOT_GAS_PER_NODE = 4500;
    uint256 public ASSIGNER_FEE = 0; // 0 EMT
    uint256 public VERIFIER_FEE = 0; // 0 EMT

    // EMT
    address immutable public tokenAddress;
    uint256 constant DECIMAL_FACTOR = 1e18;
    uint256 constant BASE_SLOT_REWARD = 12000 * 24 * DECIMAL_FACTOR; // 12,000 EMT x 24
    uint256 constant SLOT_INTERVAL = 24 hours;
    uint256 constant DECREMENT_PER_SLOT = 600 * 24 * DECIMAL_FACTOR / 365; // 600 EMT
    uint256 immutable public startSlot;

    // Slots
    mapping (uint256 => uint256) private slotTotalGas; // (slotNumber => totalGas)
    mapping (uint256 => mapping(address => uint256)) public slotGas; // (slotNumber => (nodeAddress => reward))
    mapping (uint256 => mapping(address => uint256)) public slotBalances; // (slotNumber => (nodeAddress => reward))
    mapping (address => uint256[]) public nodeSlots; // (nodeAddress => listOfSlots) for iteration
    mapping (address => mapping(uint256 => bool)) public nodeSlotUnique; // (nodeAddress => (slot => bool)) for unique check

    // Nodes
    mapping(address => Node) public nodes;
    address[] public nodeAddresses;

    // Jobs
    mapping(bytes16 => Job) public jobs;
    mapping(bytes16 => JobDetail) public jobDetails;
    mapping(bytes16 => JobAssign) public jobAssigns;
    mapping(address => bytes16) public lastJobAssigned;
    mapping(address => bytes16[]) public jobAssignedHistory;

    // Events
    event Attach(address indexed nodeAddress, uint256 deposit);
    event Detach(address indexed nodeAddress);
    event Update(address indexed nodeAddress, uint256 totalCapacity, uint256 workers, uint256 deposit);
    event Penalty(address indexed nodeAddress, uint256 slashed);
    event Request(address indexed owner, bytes16 indexed jobId, uint256 gas, uint256 gasPrice);
    event Cancel(bytes16 indexed jobId);
    event Status(bytes16 indexed jobId, address nodeAddress, uint256 status);
    event Reward(address indexed nodeAddress, uint256 slot, uint256 gas);

    // Structs
    struct Job {
        bool exist;
        bytes16 jobId;
        address owner;
        uint256 status; //0: requested, 1: assigned, 2: processing, 3: completed, 4: canceled
        uint256 requestedAt;
        uint256 assignedAt;
    }

    struct JobDetail {
        uint256 programId;
        string param;
        string dataset;
        string result;
    }

    struct JobAssign {
        address node;
        uint256 timeLimit;
        uint256 gas;
        uint256 gasPrice;
        uint256 lockedCapacity;
        uint256 retryCount;
    }

    struct Node {
        bool active;
        uint256 totalCapacity;
        uint256 lockedCapacity;
        uint256 workers;
        uint256 deposit;
    }

    modifier onlyAssignedNode(bytes16 _jobId) {
        require(jobAssigns[_jobId].node == msg.sender, "Job is not assigned to your node");
        _;
    }

    // Constructor
    constructor(address _tokenAddress) {
        tokenAddress = _tokenAddress;
        startSlot = block.timestamp.div(SLOT_INTERVAL);
    }

    // Node Functions
    function attach(uint256 _amount, uint256 _totalCapacity, uint256 _workers) external returns (bool) {
        IERC20 token = IERC20(tokenAddress);
        require(!nodes[msg.sender].active, "The node is already attached");
        require(_amount >= MIN_DEPOSIT, "Deposit is lower than minDeposit");
        require(_amount >= _totalCapacity.mul(DEPOSIT_PER_CAPACITY), "Insufficient amount for the specified totalCapacity");
        require(_workers > 0, "Number of workers is required to be non-zero");
        require(token.allowance(msg.sender, address(this)) >= _amount, "Insufficient allowance balance");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient token balance"); 

        token.transferFrom(msg.sender, address(this), _amount);

        Node memory node = Node({
            active: true,
            totalCapacity: _totalCapacity,
            lockedCapacity: 0,
            workers: _workers,
            deposit: _amount
        });
        nodes[msg.sender] = node;
        nodeAddresses.push(msg.sender);

        emit Attach(msg.sender, _amount);

        return true;
    }

    function update(uint256 _totalCapacity, uint256 _workers) external returns (bool) {
        Node storage node = nodes[msg.sender];
        require(node.active, "The node is not attached");
        require(node.deposit >= _totalCapacity.mul(DEPOSIT_PER_CAPACITY), "Insufficient amount for the specified totalCapacity");

        node.totalCapacity = _totalCapacity;
        node.workers = _workers;

        emit Update(msg.sender, node.totalCapacity, node.workers, node.deposit);
        return true;
    }

    function addDeposit(uint256 _amount) external returns (bool) {
        Node storage node = nodes[msg.sender];
        require(node.active, "The node is not attached");

        IERC20 token = IERC20(tokenAddress);
        require(node.active, "The node is not attached");
        require(node.deposit > 0, "The node deposit is 0");
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient token balance"); 

        token.transferFrom(msg.sender, address(this), _amount);
        node.deposit = node.deposit.add(_amount);

        emit Update(msg.sender, node.totalCapacity, node.workers, node.deposit);
        return true;
    }

    function removeDeposit(uint256 _amount) external returns (bool) {
        Node storage node = nodes[msg.sender];
        require(node.active, "The node is not attached");

        IERC20 token = IERC20(tokenAddress);
        require(nodes[msg.sender].deposit.sub(_amount) >= MIN_DEPOSIT, "Cannot remove deposit below minDeposit");
        require(nodes[msg.sender].deposit.sub(_amount) >= node.totalCapacity.mul(DEPOSIT_PER_CAPACITY), "Cannot remove deposit below the required deposit");
        require(nodes[msg.sender].deposit.sub(nodes[msg.sender].lockedCapacity.mul(DEPOSIT_PER_CAPACITY)) >= _amount, "Insufficient fund to remove");

        token.transfer(msg.sender, _amount);
        nodes[msg.sender].deposit = nodes[msg.sender].deposit.sub(_amount);

        emit Update(msg.sender, node.totalCapacity, node.workers, node.deposit);
        return true;
    }

    function detach() external returns (bool) {
        Node storage node = nodes[msg.sender];

        IERC20 token = IERC20(tokenAddress);
        require(node.active, "The node is not attached");
        require(node.lockedCapacity == 0, "There is locked deposit");

        uint256 amount = node.deposit;
        node.deposit = 0;
        token.transfer(msg.sender, amount);

        node.active = false;

        emit Detach(msg.sender);
        return true;
    }

    // Job Functions
    // Requester
    function request(bytes16 _jobId, uint256 _programId, string calldata _dataset, string calldata _param, uint256 _gas, uint256 _gasPrice, uint256 _timeLimit) external returns (bool) {
        require(!jobs[_jobId].exist, "Job ID already exists");

        uint256 fee = _gas.mul(_gasPrice);

        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(msg.sender) >= fee);
        token.transferFrom(msg.sender, address(this), fee);

        jobs[_jobId] = Job({
            exist: true,
            jobId: _jobId,
            owner: msg.sender,
            status: REQUESTED,
            requestedAt: block.timestamp,
            assignedAt: 0
        });

        jobDetails[_jobId] = JobDetail({
            programId: _programId,
            param: _param,
            dataset: _dataset,
            result: ""
        });

        jobAssigns[_jobId] = JobAssign({
            node: address(0),
            timeLimit: _timeLimit,
            gas: _gas,
            gasPrice: _gasPrice,
            lockedCapacity: 0,
            retryCount: 0
        });

        emit Request(msg.sender, _jobId, _gas, _gasPrice);
        return true;
    }

    function cancel(bytes16 _jobId) external returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "Job doesn't exist");
        require(job.owner == msg.sender, "Permission denied");
        require(job.status == REQUESTED, "Job is already being processed or canceled");

        uint256 refund = jobAssign.gas.mul(jobAssign.gasPrice);

        job.status = CANCELED;

        IERC20 token = IERC20(tokenAddress);
        token.transfer(msg.sender, refund);

        emit Cancel(_jobId);
        return true;
    }

    function process(bytes16 _jobId) external onlyAssignedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];

        require(job.status == ASSIGNED);

        job.status = PROCESSING;

        emit Status(_jobId, msg.sender, job.status);
        return true;
    }

    function decline(bytes16 _jobId) external onlyAssignedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];
        Node storage node = nodes[jobAssign.node];

        require(job.status == ASSIGNED || job.status == PROCESSING);

        job.status = DECLINED;
        lastJobAssigned[jobAssign.node] = 0;

        // Penalty if it's already being processed
        if(job.status == PROCESSING) {
            job.status = TIMEOUT;

            // Tx Fee Refund
            IERC20 token = IERC20(tokenAddress);
            token.transfer(job.owner, jobAssign.gas.mul(jobAssign.gasPrice));

            // Penalty
            _burnDeposit(jobAssign.node, TIMEOUT_PENALTY);
        }

        // Unlock Capacity
        node.lockedCapacity = node.lockedCapacity.sub(jobAssign.lockedCapacity);

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    function submit(bytes16 _jobId, string calldata _result) external onlyAssignedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];
        JobDetail storage jobDetail = jobDetails[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];
        Node storage node = nodes[jobAssign.node];

        require(job.status == PROCESSING, "Job is not started processing");

        job.status = SUBMITTED;
        jobDetail.result = _result;

        // Unlock Capacity
        node.lockedCapacity = node.lockedCapacity.sub(jobAssign.lockedCapacity);

        emit Status(_jobId, msg.sender, job.status);
        return true;
    }

    // Assigner
    function assign(bytes16 _jobId, address _node, uint256 _estimatedGas, uint256 _timeLimit) external onlyAssigner returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];
        Node storage node = nodes[_node];
        uint256 requiredCapacity = _calculateCapacity(_estimatedGas, _timeLimit);

        require(job.status == REQUESTED, "Job status is not REQUESTED");
        require(jobAssign.gas >= _estimatedGas, "Insufficient gas on the job");
        require(node.totalCapacity.sub(node.lockedCapacity) >= requiredCapacity, "Insufficient available Capacity on the node");

        //Refund gas
        uint256 refund = jobAssign.gas.sub(_estimatedGas).mul(jobAssign.gasPrice);
        if(refund > 0) {
            IERC20 token = IERC20(tokenAddress);
            token.transfer(job.owner, refund);
        }

        job.status = ASSIGNED;
        job.assignedAt = block.timestamp;
        jobAssign.node = _node;
        jobAssign.timeLimit = _timeLimit;
        jobAssign.gas = _estimatedGas;
        lastJobAssigned[jobAssign.node] = _jobId;
        jobAssignedHistory[jobAssign.node].push(_jobId);

        // Lock Capacity
        uint256 adjustedCapacity = _adjustedCapacity(requiredCapacity, _node);
        node.lockedCapacity = node.lockedCapacity.add(adjustedCapacity);
        jobAssign.lockedCapacity = adjustedCapacity;

        emit Status(_jobId, _node, job.status);
        return true;
    }

    function rejectJob(bytes16 _jobId) external onlyAssigner returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.status == REQUESTED, "Job status is not REQUESTED");

        job.status = REJECTED;

        // Tx Fee Refund
        uint256 refund = jobAssign.gas.mul(jobAssign.gasPrice).sub(ASSIGNER_FEE);
        if(refund > 0) {
            IERC20 token = IERC20(tokenAddress);
            token.transfer(assigner, ASSIGNER_FEE);
            token.transfer(job.owner, refund);
        }

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    // Verifier
    function verify(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.status == SUBMITTED, "Job result is not submitted");

        job.status = VERIFIED;

        // Put in Reward Slot
        uint256 slot = _putSlotReward(_jobId);

        // Tx Fee
        uint256 nodeFee = jobAssign.gas.mul(jobAssign.gasPrice).sub(VERIFIER_FEE);
        IERC20 token = IERC20(tokenAddress);
        token.transfer(verifier, VERIFIER_FEE);
        token.transfer(jobAssign.node, nodeFee);

        emit Status(_jobId, jobAssign.node, job.status);
        emit Reward(jobAssign.node, slot, jobAssign.gas);

        return true;
    }

    function timeout(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];
        Node storage node = nodes[jobAssign.node];

        require(job.status == ASSIGNED || job.status == PROCESSING, "Job is not assigned");

        if(jobAssign.retryCount > MAX_RETRY_COUNT) {
            job.status = TIMEOUT;

            // Tx Fee Refund
            IERC20 token = IERC20(tokenAddress);
            token.transfer(job.owner, jobAssign.gas.mul(jobAssign.gasPrice));
        }else{
            job.status = REQUESTED; // Waiting for being re-assigned
        }
        lastJobAssigned[jobAssign.node] = 0;

        // Penalty
        _burnDeposit(jobAssign.node, TIMEOUT_PENALTY);

        // Unlock Capacity
        node.lockedCapacity = node.lockedCapacity.sub(jobAssign.lockedCapacity);

        jobAssign.retryCount++;

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    function rejectResult(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];
        Node storage node = nodes[jobAssign.node];

        require(jobs[_jobId].status == SUBMITTED, "Job result is not submitted");

        job.status = FAILED;
        lastJobAssigned[jobAssign.node] = 0;

        // Tx Fee Refund
        uint256 fee = jobAssign.gas.mul(jobAssign.gasPrice);
        IERC20 token = IERC20(tokenAddress);
        token.transfer(job.owner, fee);

        // Penalty for the Node
        node.deposit = node.deposit.sub(VERIFIER_FEE);
        token.transfer(verifier, VERIFIER_FEE);
        _burnDeposit(jobAssign.node, fee.sub(VERIFIER_FEE));

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    // Public
    function withdrawSlotReward(uint256 _slot) external returns (bool) {
        require(_slot < block.timestamp.div(SLOT_INTERVAL), "The slot has not been closed");
        require(slotBalances[_slot][msg.sender] > 0, "The slot reward is empty");

        uint256 reward = slotReward(_slot).mul(slotBalances[_slot][msg.sender]).div(slotTotalGas[_slot]);
        IERC20 token = IERC20(tokenAddress);
        token.mint(msg.sender, reward);

        slotBalances[_slot][msg.sender] = 0;

        return true;
    }

    // Utilities
    function checkAvailability(uint256 _powerCapacity) public view returns (uint256) {
        uint256 count = 0;
        for(uint256 i = 0; i < nodeAddresses.length; i++) {
            if(nodes[nodeAddresses[i]].totalCapacity - nodes[nodeAddresses[i]].lockedCapacity >= _powerCapacity) {
                count++;
            }
        }
        return count;
    }

    function findAvailableNode(uint256 _powerCapacity) public view returns (address) {
        uint256 count = checkAvailability(_powerCapacity);
        uint256 index = uint256(keccak256(abi.encode(block.timestamp))) % count;
        address node;
        for(uint256 i = 0; i < nodeAddresses.length; i++) {
            if(nodes[nodeAddresses[i]].totalCapacity - nodes[nodeAddresses[i]].lockedCapacity >= _powerCapacity) {
                if(index == 0) node = nodeAddresses[i]; 
                index--;
            }
        }
        return node;
    }

    function currentSlotReward() external view returns (uint256) {
        return slotReward(currentSlot());
    }

    function currentSlot() public view returns (uint256) {
        return block.timestamp.div(SLOT_INTERVAL);
    }

    function slotReward(uint256 _slot) private view returns (uint256) {
        uint256 reward = 0;
        uint256 halvingAmount = _slot.sub(startSlot).mul(DECREMENT_PER_SLOT);
        if(BASE_SLOT_REWARD > halvingAmount) {
            reward = BASE_SLOT_REWARD.sub(halvingAmount);
        }
        return reward;
    }

    function nodeSlotCount(address _node) external view returns (uint256) {
        return nodeSlots[_node].length;
    }

    function jobAssignedCount(address _node) external view returns (uint256) {
        return jobAssignedHistory[_node].length;
    }

    function nodeCount() external view returns (uint256) {
        return nodeAddresses.length;
    }

    function slots(uint256 _slot) external view returns (uint256 _totalGas, uint256 _totalReward) {
        return (slotTotalGas[_slot], slotReward(_slot));
    }

    function _calculateDeposit(uint256 _gas, uint256 _timeLimit) private pure returns (uint256) {
        return _calculateCapacity(_gas, _timeLimit).mul(DEPOSIT_PER_CAPACITY);
    }

    function _calculateCapacity(uint256 _gas, uint256 _timeLimit) private pure returns (uint256) {
        return _gas.mul(1000000).div(_timeLimit);
    }

    function _adjustedCapacity(uint256 _requiredCapacity, address _node) private view returns (uint256) {
        uint256 avgCapacity = nodes[_node].totalCapacity.div(nodes[_node].workers);
        uint256 adjustedLockCapacity = _requiredCapacity.sub(1).div(avgCapacity).add(1).mul(avgCapacity);
        return adjustedLockCapacity;
    }

    function _putSlotReward(bytes16 _jobId) private returns (uint256) {
        JobAssign storage jobAssign = jobAssigns[_jobId];
        address node = jobAssigns[_jobId].node;
        uint256 slot = block.timestamp.div(SLOT_INTERVAL);

        if(slotGas[slot][node].add(jobAssign.gas) < MAX_SLOT_GAS_PER_NODE) {
            slotTotalGas[slot] = slotTotalGas[slot].add(jobAssign.gas);
            slotGas[slot][node] = slotGas[slot][node].add(jobAssign.gas);
            slotBalances[slot][node] = slotBalances[slot][node].add(jobAssign.gas);
            if(!nodeSlotUnique[node][slot]) {
                nodeSlots[node].push(slot);
                nodeSlotUnique[node][slot] = true;
            }
        }

        return slot;
    }

    function _burnDeposit(address _node, uint256 _amount) private returns (bool) {
        uint256 burnAmount = nodes[_node].deposit >= _amount ? _amount : nodes[_node].deposit;
        IERC20 token = IERC20(tokenAddress);
        nodes[_node].deposit = nodes[_node].deposit.sub(burnAmount);
        token.burn(burnAmount);
        return true;
    }

    // Test Functions
    function setAssignerFee(uint256 _fee) external returns (bool) {
        ASSIGNER_FEE = _fee;
        return true;
    }

    function setVerifierFee(uint256 _fee) external returns (bool) {
        VERIFIER_FEE = _fee;
        return true;
    }

    function setMaxSlotGasPerNode(uint256 _maxSlotGas) external returns (bool) {
        MAX_SLOT_GAS_PER_NODE = _maxSlotGas;
        return true;
    }

    function updateJob (bytes16 _jobId, address _owner, uint256 _status, uint256 _requestedAt, uint256 _assignedAt) external returns (bool) {
        Job storage job = jobs[_jobId];
        job.owner = _owner;
        job.status = _status;
        job.requestedAt = _requestedAt;
        job.assignedAt = _assignedAt;
        return true;
    }

    function updateJobDetail(bytes16 _jobId, uint256 _programId, string calldata _param, string calldata _dataset, string calldata _result) external returns (bool) {
        JobDetail storage jobDetail = jobDetails[_jobId];
        jobDetail.programId = _programId;
        jobDetail.param = _param;
        jobDetail.dataset = _dataset;
        jobDetail.result = _result;
        return true;
    }

    function updateJobAssign(bytes16 _jobId, address _node, uint256 _timeLimit, uint256 _gas, uint256 _gasPrice, uint256 _lockedCapacity, uint256 _retryCount) external returns (bool) {
        JobAssign storage jobAssign = jobAssigns[_jobId];
        jobAssign.node = _node;
        jobAssign.timeLimit = _timeLimit;
        jobAssign.gas = _gas;
        jobAssign.gasPrice = _gasPrice;
        jobAssign.lockedCapacity = _lockedCapacity;
        jobAssign.retryCount = _retryCount;
        return true;
    }

    function updateNode(address _node, bool _active, uint256 _totalCapacity, uint256 _lockedCapacity, uint256 _workers, uint256 _deposit) external returns (bool) {
        Node storage node = nodes[_node];
        node.active = _active;
        node.totalCapacity = _totalCapacity;
        node.lockedCapacity = _lockedCapacity;
        node.workers = _workers;
        node.deposit = _deposit;
        return true;
    }
}