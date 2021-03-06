/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { Contract, Signer } from "ethers";
import { Provider } from "@ethersproject/providers";

import type { Emeth } from "../Emeth";

export class Emeth__factory {
  static connect(address: string, signerOrProvider: Signer | Provider): Emeth {
    return new Contract(address, _abi, signerOrProvider) as Emeth;
  }
}

const _abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "deposit",
        type: "uint256",
      },
    ],
    name: "Attach",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes16",
        name: "jobId",
        type: "bytes16",
      },
    ],
    name: "Cancel",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
    ],
    name: "Detach",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "slashed",
        type: "uint256",
      },
    ],
    name: "Penalty",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "bytes16",
        name: "jobId",
        type: "bytes16",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "gas",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "gasPrice",
        type: "uint256",
      },
    ],
    name: "Request",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "slot",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "gas",
        type: "uint256",
      },
    ],
    name: "Reward",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes16",
        name: "jobId",
        type: "bytes16",
      },
      {
        indexed: false,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "status",
        type: "uint256",
      },
    ],
    name: "Status",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "nodeAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalCapacity",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "workers",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "deposit",
        type: "uint256",
      },
    ],
    name: "Update",
    type: "event",
  },
  {
    inputs: [],
    name: "ASSIGNER_FEE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DEPOSIT_PER_CAPACITY",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MIN_DEPOSIT",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "VERIFIER_FEE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "addDeposit",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "address",
        name: "_node",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_estimatedGas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_timeLimit",
        type: "uint256",
      },
    ],
    name: "assign",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "assigner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_totalCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_workers",
        type: "uint256",
      },
    ],
    name: "attach",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "cancel",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_powerCapacity",
        type: "uint256",
      },
    ],
    name: "checkAvailability",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentSlot",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentSlotReward",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "decline",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "detach",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_powerCapacity",
        type: "uint256",
      },
    ],
    name: "findAvailableNode",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_addr",
        type: "address",
      },
    ],
    name: "isAssigner",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_addr",
        type: "address",
      },
    ],
    name: "isVerifier",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    name: "jobAssigns",
    outputs: [
      {
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "timeLimit",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "gas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "gasPrice",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "lockedCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "retryCount",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    name: "jobDetails",
    outputs: [
      {
        internalType: "uint256",
        name: "programId",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "param",
        type: "string",
      },
      {
        internalType: "string",
        name: "dataset",
        type: "string",
      },
      {
        internalType: "string",
        name: "result",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    name: "jobs",
    outputs: [
      {
        internalType: "bool",
        name: "exist",
        type: "bool",
      },
      {
        internalType: "bytes16",
        name: "jobId",
        type: "bytes16",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "status",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "requestedAt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "assignedAt",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "lastJobAssigned",
    outputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "nodeAddresses",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_node",
        type: "address",
      },
    ],
    name: "nodeSlotCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "nodeSlots",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "nodes",
    outputs: [
      {
        internalType: "bool",
        name: "active",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "totalCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "lockedCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "workers",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "deposit",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "process",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "rejectJob",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "rejectResult",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    name: "removeDeposit",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "uint256",
        name: "_programId",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "_dataset",
        type: "string",
      },
      {
        internalType: "string",
        name: "_param",
        type: "string",
      },
      {
        internalType: "uint256",
        name: "_gas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_gasPrice",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_timeLimit",
        type: "uint256",
      },
    ],
    name: "request",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_addr",
        type: "address",
      },
    ],
    name: "setAssigner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_fee",
        type: "uint256",
      },
    ],
    name: "setAssignerFee",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_addr",
        type: "address",
      },
    ],
    name: "setVerifier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_fee",
        type: "uint256",
      },
    ],
    name: "setVerifierFee",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "slotBalances",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "slotGas",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_slot",
        type: "uint256",
      },
    ],
    name: "slots",
    outputs: [
      {
        internalType: "uint256",
        name: "_totalGas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_totalReward",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "startSlot",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "string",
        name: "_result",
        type: "string",
      },
    ],
    name: "submit",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "timeout",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_totalCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_workers",
        type: "uint256",
      },
    ],
    name: "update",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "address",
        name: "_owner",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_status",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_requestedAt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_assignedAt",
        type: "uint256",
      },
    ],
    name: "updateJob",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "address",
        name: "_node",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_timeLimit",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_gas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_gasPrice",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_lockedCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_retryCount",
        type: "uint256",
      },
    ],
    name: "updateJobAssign",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
      {
        internalType: "uint256",
        name: "_programId",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "_param",
        type: "string",
      },
      {
        internalType: "string",
        name: "_dataset",
        type: "string",
      },
      {
        internalType: "string",
        name: "_result",
        type: "string",
      },
    ],
    name: "updateJobDetail",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_node",
        type: "address",
      },
      {
        internalType: "bool",
        name: "_active",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "_totalCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_lockedCapacity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_workers",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_deposit",
        type: "uint256",
      },
    ],
    name: "updateNode",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "verifier",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "_jobId",
        type: "bytes16",
      },
    ],
    name: "verify",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_slot",
        type: "uint256",
      },
    ],
    name: "withdrawSlotReward",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];
