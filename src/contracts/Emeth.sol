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

contract EmethCore is VerifierRole {
    using SafeMath for uint256;

    address owner;

    // Constants
    uint256 constant REQUESTED = 0;
    uint256 constant ASSIGNED = 1; // deprecated
    uint256 constant PROCESSING = 2;
    uint256 constant SUBMITTED = 3;
    uint256 constant VERIFIED = 4;
    uint256 constant REJECTED = 5;
    uint256 constant CANCELED = 6;
    uint256 constant TIMEOUT = 7;
    uint256 constant FAILED = 8;
    uint256 constant DECLINED = 9;

    // Paramters
    uint256 public TIMEOUT_PENALTY_RATE = 10000; // 10% of fee
    uint256 public DECLINE_PENALTY_RATE = 10000; // 10% of fee
    uint256 public FAILED_PENALTY_RATE = 100000; // 100% of fee
    uint256 public DEPOSIT_RATE = 100000; // 100% of fee
    uint256 public MAX_SLOT_GAS_PER_NODE = 9000;
    uint256 public VERIFIER_FEE = 10000000000000000000; // 10 EMT

    // Paramters (deprecated)
    //uint256 constant TIMEOUT_PENALTY = 10000000000000000000; // 10 EMT
    //uint256 public constant MIN_DEPOSIT = 10000000000000000000000; // 10,000 * 1 EMT = 10,000 EMT
    //uint256 public constant DEPOSIT_PER_CAPACITY = 1000000000000000000; // 1 EMT
    //uint256 public ASSIGNER_FEE = 0; // 0 EMT

    // EMT
    IERC20 immutable public emtToken;
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
    //mapping(address => Node) public nodes;
    //address[] public nodeAddresses;

    // Jobs
    // (required)
    mapping(bytes16 => Job) public jobs;
    mapping(bytes16 => JobDetail) public jobDetails;
    mapping(bytes16 => JobAssign) public jobAssigns;

    // (new)
    bytes16[] public jobIndexes;

    // (deprecated)
    //mapping(address => bytes16) public lastJobAssigned;
    //mapping(address => bytes16[]) public jobAssignedHistory;

    // Events
    event Penalty(address indexed nodeAddress, uint256 slashed);
    event Request(address indexed owner, bytes16 indexed jobId, uint256 fee, uint256 deadline);
    event Cancel(bytes16 indexed jobId);
    event Status(bytes16 indexed jobId, address nodeAddress, uint256 status);
    event Reward(address indexed nodeAddress, uint256 slot, uint256 gas);

    // Structs
    struct Job {
        bool exist;
        bytes16 jobId;
        address owner;
        uint256 deadline;
        uint256 fee;
        uint256 status; //0: requested, 1: assigned, 2: processing, 3: completed, 4: canceled
        uint256 requestedAt;
    }

    struct JobDetail {
        uint256 programId;
        string param;
        string dataset;
        string result;
    }

    struct JobAssign {
        address node;
        uint256 deposit;
        uint256 gas;
        uint256 startedAt;
        uint256 submittedAt;
        uint256 verifiedAt;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, 'insufficient privilege');
        _;
    }

    modifier onlyAssignedNode(bytes16 _jobId) {
        require(jobAssigns[_jobId].node == msg.sender, "EmethCore: job is not assigned to your node");
        _;
    }

    modifier onlyRequestedNode(bytes16 _jobId) {
        require(jobs[_jobId].owner == msg.sender, "EmethCore: job is not requested by your node");
        _;
    }

    // Constructor
    constructor(address _tokenAddress) {
        owner = msg.sender;
        emtToken= IERC20(_tokenAddress);
        startSlot = block.timestamp.div(SLOT_INTERVAL);
    }

    // Functions for Requester
    function request(
        bytes16 _jobId,
        uint256 _programId,
        string calldata _dataset,
        string calldata _param,
        uint256 _fee,
        uint256 _deadline
    ) external returns (bool) {
        require(!jobs[_jobId].exist, "Job ID already exists");

        require(emtToken.balanceOf(msg.sender) >= _fee, 'EmethCore: insufficient balance for fee');
        require(emtToken.allowance(msg.sender, address(this)) >= _fee, 'EmethCore: insufficient allowance for fee');
        emtToken.transferFrom(msg.sender, address(this), _fee);

        jobs[_jobId] = Job({
            exist: true,
            jobId: _jobId,
            owner: msg.sender,
            deadline: _deadline,
            fee: _fee,
            status: REQUESTED,
            requestedAt: block.timestamp
        });

        jobDetails[_jobId] = JobDetail({
            programId: _programId,
            param: _param,
            dataset: _dataset,
            result: ""
        });

        jobAssigns[_jobId] = JobAssign({
            node: address(0),
            deposit: 0,
            gas: 0,
            startedAt: 0,
            submittedAt: 0,
            verifiedAt: 0
        });

        jobIndexes.push(_jobId);

        emit Request(msg.sender, _jobId, _fee, _deadline);
        return true;
    }

    function cancel(bytes16 _jobId) external onlyRequestedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == REQUESTED, "Job is already being processed or canceled");

        job.status = CANCELED;

        emtToken.transfer(msg.sender, job.fee);

        emit Cancel(_jobId);
        return true;
    }

    // Functions for Node
    function process(bytes16 _jobId) external returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == REQUESTED);

        uint256 deposit = job.fee * DEPOSIT_RATE / 100000;
        require(emtToken.balanceOf(msg.sender) >= deposit, "EmethCore: insufficient balance for deposit");
        require(emtToken.allowance(msg.sender, address(this)) >= deposit, "EmethCore: insufficient allowance for deposit");
        emtToken.transferFrom(msg.sender, address(this), deposit);

        job.status = PROCESSING;
        jobAssign.node = msg.sender;
        jobAssign.deposit = deposit;
        jobAssign.startedAt = block.timestamp;

        emit Status(_jobId, msg.sender, job.status);
        return true;
    }

    function decline(bytes16 _jobId) external onlyAssignedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == PROCESSING, "EmethCore: job is not being processed");

        job.status = DECLINED;

        // Fee Refund
        emtToken.transfer(job.owner, job.fee);

        // Deposit Refund with Penalty
        uint256 penalty = job.fee * DECLINE_PENALTY_RATE / 100000;
        if(penalty < jobAssign.deposit) {
            emtToken.transfer(msg.sender, jobAssign.deposit - penalty);
        }

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    function submit(bytes16 _jobId, string calldata _result) external onlyAssignedNode(_jobId) returns (bool) {
        Job storage job = jobs[_jobId];
        JobDetail storage jobDetail = jobDetails[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == PROCESSING, "EmethCore: job is not being processed");

        job.status = SUBMITTED;
        jobDetail.result = _result;
        jobAssign.submittedAt = block.timestamp;

        emit Status(_jobId, msg.sender, job.status);
        return true;
    }

    function withdrawSlotReward(uint256 _slot) external returns (bool) {
        require(_slot < block.timestamp.div(SLOT_INTERVAL), "The slot has not been closed");
        require(slotBalances[_slot][msg.sender] > 0, "The slot reward is empty");

        uint256 reward = slotReward(_slot).mul(slotBalances[_slot][msg.sender]).div(slotTotalGas[_slot]);
        emtToken.mint(msg.sender, reward);

        slotBalances[_slot][msg.sender] = 0;

        return true;
    }

    // Functions for Verifier
    function verify(bytes16 _jobId, uint256 _gas) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == SUBMITTED, "EmethCore: job result is not submitted");

        job.status = VERIFIED;
        jobAssign.gas = _gas;

        // Put in Reward Slot
        uint256 slot = _putSlotReward(_jobId);

        // Tx Fee
        emtToken.transfer(verifier, VERIFIER_FEE);
        emtToken.transfer(jobAssign.node, job.fee - VERIFIER_FEE);

        emit Status(_jobId, jobAssign.node, job.status);
        emit Reward(jobAssign.node, slot, jobAssign.gas);

        return true;
    }

    function timeout(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(job.status == PROCESSING, "EmethCore: job is not being processed");

        job.status = TIMEOUT;

        // Tx Fee Refund
        emtToken.transfer(job.owner, job.fee);

        // Deposit Refund with Penalty
        uint256 penalty = job.fee * TIMEOUT_PENALTY_RATE / 100000;
        if(penalty < jobAssign.deposit) {
            emtToken.transfer(jobAssign.node, jobAssign.deposit - penalty);
        }

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    function rejectResult(bytes16 _jobId) external onlyVerifier returns (bool) {
        Job storage job = jobs[_jobId];
        JobAssign storage jobAssign = jobAssigns[_jobId];

        require(job.exist, "EmethCore: job doesn't exist");
        require(jobs[_jobId].status == SUBMITTED, "EmethCore: job result is not submitted");

        job.status = FAILED;

        // Tx Fee Refund
        emtToken.transfer(job.owner, job.fee);

        // Deposit Refund with Penalty
        uint256 penalty = job.fee * FAILED_PENALTY_RATE / 100000 + VERIFIER_FEE;
        if(penalty < jobAssign.deposit) {
            emtToken.transfer(jobAssign.node, jobAssign.deposit - penalty);
        }

        emit Status(_jobId, jobAssign.node, job.status);
        return true;
    }

    // Utilities
    // Public
    function getEstimatedGas(uint256 _datasetSizeMB, uint256 _algoComplexity) external pure returns (uint256) {
        return _datasetSizeMB.mul(_algoComplexity).div(1000);
    }

    function currentSlotReward() external view returns (uint256) {
        return slotReward(currentSlot());
    }

    function currentSlot() public view returns (uint256) {
        return block.timestamp.div(SLOT_INTERVAL);
    }

    function nodeSlotCount(address _node) external view returns (uint256) {
        return nodeSlots[_node].length;
    }

    function slots(uint256 _slot) external view returns (uint256 _totalGas, uint256 _totalReward) {
        return (slotTotalGas[_slot], slotReward(_slot));
    }

    // Private
    function _putSlotReward(bytes16 _jobId) private returns (uint256) {
        JobAssign storage jobAssign = jobAssigns[_jobId];
        address node = jobAssigns[_jobId].node;
        uint256 slot = block.timestamp.div(SLOT_INTERVAL);

        uint256 gasCounted = jobAssign.gas;
        if(slotGas[slot][node].add(jobAssign.gas) >= MAX_SLOT_GAS_PER_NODE) {
            gasCounted = MAX_SLOT_GAS_PER_NODE - slotGas[slot][node];
        }

        slotTotalGas[slot] = slotTotalGas[slot].add(gasCounted);
        slotGas[slot][node] = slotGas[slot][node].add(gasCounted);
        slotBalances[slot][node] = slotBalances[slot][node].add(gasCounted);
        if(!nodeSlotUnique[node][slot]) {
            nodeSlots[node].push(slot);
            nodeSlotUnique[node][slot] = true;
        }

        return slot;
    }

    function slotReward(uint256 _slot) private view returns (uint256) {
        uint256 reward = 0;
        uint256 halvingAmount = _slot.sub(startSlot).mul(DECREMENT_PER_SLOT);
        if(BASE_SLOT_REWARD > halvingAmount) {
            reward = BASE_SLOT_REWARD.sub(halvingAmount);
        }
        return reward;
    }

}
