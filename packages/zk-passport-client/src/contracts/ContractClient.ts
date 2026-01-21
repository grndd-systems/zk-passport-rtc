import type { Provider } from 'ethers';
import { Contract, AbiCoder, toBeHex, isAddress } from 'ethers';
import type {
  RegistrationProofData,
  QueryProofData,
  UnsignedTransaction,
} from '../types';
import { encodePassportDate } from '../utils';

/**
 * Contract ABIs (minimal interfaces needed)
 */
const QUERY_PROOF_EXECUTOR_ABI = [
  {
    name: 'getPublicSignals',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'currentDate_', type: 'uint256' },
      { name: 'userPayload_', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'executeNoir',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'currentDate_', type: 'uint256' },
      { name: 'userPayload_', type: 'bytes' },
      { name: 'zkPoints_', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const REGISTRATION2_ABI = [
  {
    name: 'registerViaNoir',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'certificatesRoot_', type: 'bytes32' },
      { name: 'sessionKey_', type: 'uint256' },
      { name: 'dgCommit_', type: 'uint256' },
      {
        name: 'passport_',
        type: 'tuple',
        components: [
          { name: 'dataType', type: 'bytes32' },
          { name: 'zkType', type: 'bytes32' },
          { name: 'signature', type: 'bytes' },
          { name: 'publicKey', type: 'bytes' },
          { name: 'passportHash', type: 'bytes32' },
        ],
      },
      { name: 'zkPoints_', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const STATE_KEEPER_ABI = [
  {
    name: 'getSessionInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'sessionKey_', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'activePassport', type: 'bytes32' },
          { name: 'issueTimestamp', type: 'uint64' },
        ],
      },
    ],
  },
] as const;

/**
 * Contract parameters for query proof
 *
 * Date/Timestamp encoding types:
 * - PT (Passport Timestamp): UTF-8 "YYMMDD" → hex → bigint
 *   Example: "260411" → 0x323630343131 → 55208318349617
 *   Zero time: "000000" → 0x303030303030 → 52983525027888
 *
 * - UT (UNIX Timestamp): Standard UNIX timestamp (seconds since epoch)
 *   Example: 1716482295 (May 23, 2024)
 *   Zero time: 0
 */
export interface QueryProofParams {
  eventID: bigint;
  eventData: bigint;
  pkIdentityHash: bigint;
  selector: bigint;
  currentDate: bigint; // PT - Passport Timestamp
  timestampLowerbound: bigint; // UT - UNIX Timestamp
  timestampUpperbound: bigint; // UT - UNIX Timestamp
  identityCounterLowerbound: bigint;
  identityCounterUpperbound: bigint;
  birthDateLowerbound: bigint; // PT - Passport Timestamp
  birthDateUpperbound: bigint; // PT - Passport Timestamp
  expirationDateLowerbound: bigint; // PT - Passport Timestamp
  expirationDateUpperbound: bigint; // PT - Passport Timestamp
  citizenshipMask: bigint;
  passportHash: string;
  sessionKey: string;
  userAddress: string;
}

/**
 * Client for interacting with zk-passport contracts
 */
export class ContractClient {
  private abiCoder: AbiCoder;
  private debug: boolean;

  constructor(
    private provider: Provider,
    private addresses: {
      registration: string;
      queryProofExecutor: string;
      stateKeeper: string;
    },
    options?: { debug?: boolean }
  ) {
    // Validate contract addresses
    if (!isAddress(addresses.registration)) {
      throw new Error(`Invalid registration contract address: ${addresses.registration}`);
    }
    if (!isAddress(addresses.queryProofExecutor)) {
      throw new Error(`Invalid queryProofExecutor contract address: ${addresses.queryProofExecutor}`);
    }
    if (!isAddress(addresses.stateKeeper)) {
      throw new Error(`Invalid stateKeeper contract address: ${addresses.stateKeeper}`);
    }

    this.abiCoder = AbiCoder.defaultAbiCoder();
    this.debug = options?.debug ?? false;
  }

  /**
   * Internal logging - only outputs when debug mode is enabled
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  /**
   * Get blockchain timestamp and calculate date values
   * Reuses single block fetch to avoid race conditions
   */
  private async getBlockchainDates(): Promise<{
    blockTimestamp: number;
    blockDate: Date;
    currentDateDecimal: number;
    currentDateEncoded: bigint;
    minExpirationDecimal: number;
    minExpirationEncoded: bigint;
  }> {
    const block = await this.provider.getBlock('latest');
    if (!block) throw new Error('Unable to get latest block');

    const blockDate = new Date(Number(block.timestamp) * 1000);

    // Current date in YYMMDD decimal
    const currentDateDecimal = parseInt(
      blockDate.getFullYear().toString().slice(-2) +
      String(blockDate.getMonth() + 1).padStart(2, '0') +
      String(blockDate.getDate()).padStart(2, '0')
    );
    const currentDateEncoded = encodePassportDate(currentDateDecimal);

    // Min expiration date (6 months from blockchain date)
    const sixMonthsLater = new Date(blockDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const minExpirationDecimal = parseInt(
      sixMonthsLater.getFullYear().toString().slice(-2) +
      String(sixMonthsLater.getMonth() + 1).padStart(2, '0') +
      String(sixMonthsLater.getDate()).padStart(2, '0')
    );
    const minExpirationEncoded = encodePassportDate(minExpirationDecimal);

    return {
      blockTimestamp: Number(block.timestamp),
      blockDate,
      currentDateDecimal,
      currentDateEncoded,
      minExpirationDecimal,
      minExpirationEncoded,
    };
  }

  /**
   * Check if user is registered
   */
  async isUserRegistered(sessionKey: string): Promise<boolean> {
    try {
      const contract = new Contract(
        this.addresses.stateKeeper,
        STATE_KEEPER_ABI,
        this.provider
      );

      const sessionInfo = await contract.getSessionInfo(sessionKey);

      return (
        sessionInfo &&
        sessionInfo.activePassport !==
          '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
    } catch (error) {
      // Contract reverts if session doesn't exist
      return false;
    }
  }

  /**
   * Get contract parameters for query proof generation
   */
  async getQueryProofParams(
    passportHash: string,
    sessionKey: string,
    userAddress: string
  ): Promise<QueryProofParams> {
    // Get dates from blockchain (single fetch to avoid race conditions)
    const dates = await this.getBlockchainDates();

    this.log('📋 Building userPayload with:');
    this.log('  block.timestamp:', dates.blockTimestamp, '→', dates.blockDate.toISOString());
    this.log('  user (address):', userAddress);
    this.log('  sessionKey (bytes32):', sessionKey);
    this.log('  passportHash (bytes32):', passportHash);
    this.log('  currentDateDecimal (from blockchain):', dates.currentDateDecimal);
    this.log('  currentDateEncoded (hex ASCII):', '0x' + dates.currentDateEncoded.toString(16), '(', dates.currentDateEncoded.toString(), ')');
    this.log('  minExpirationDate (decimal):', dates.minExpirationDecimal);
    this.log('  minExpirationDate (encoded hex ASCII):', '0x' + dates.minExpirationEncoded.toString(16), '(', dates.minExpirationEncoded.toString(), ')');

    // Build userPayload
    const userPayload = this.abiCoder.encode(
      ['address', 'bytes32', 'bytes32', 'uint256'],
      [userAddress, sessionKey, passportHash, dates.minExpirationEncoded]
    );

    this.log('📋 Encoded userPayload:', userPayload);
    this.log('📋 Contract call to:', this.addresses.queryProofExecutor);

    // Call contract.getPublicSignals
    const contract = new Contract(
      this.addresses.queryProofExecutor,
      QUERY_PROOF_EXECUTOR_ABI,
      this.provider
    );

    const publicSignals = await contract.getPublicSignals(
      dates.currentDateEncoded,
      userPayload
    );

    // Log all public inputs from contract
    this.log('📊 All public inputs from contract:');
    for (let i = 0; i < publicSignals.length; i++) {
      this.log(`  [${i}]:`, publicSignals[i].toString());
    }

    this.log('📊 Named public signals:');
    this.log('  [9] eventID:', publicSignals[9].toString());
    this.log('  [10] eventData:', publicSignals[10].toString());
    this.log('  [11] pkIdentityHash:', publicSignals[11].toString());
    this.log('  [12] selector:', publicSignals[12].toString());
    this.log('  [13] currentDate (PT):', publicSignals[13].toString());
    this.log('  [14] timestampLowerbound (UT):', publicSignals[14].toString());
    this.log('  [15] timestampUpperbound (UT):', publicSignals[15].toString());
    this.log('  [16] identityCounterLowerbound:', publicSignals[16].toString());
    this.log('  [17] identityCounterUpperbound:', publicSignals[17].toString());
    this.log('  [18] birthDateLowerbound (PT):', publicSignals[18].toString());
    this.log('  [19] birthDateUpperbound (PT):', publicSignals[19].toString());
    this.log('  [20] expirationDateLowerbound (PT):', publicSignals[20].toString());
    this.log('  [21] expirationDateUpperbound (PT):', publicSignals[21].toString());
    this.log('  [22] citizenshipMask:', publicSignals[22].toString());

    // Extract parameters from public signals [9-22]
    return {
      eventID: publicSignals[9],
      eventData: publicSignals[10],
      pkIdentityHash: publicSignals[11],
      selector: publicSignals[12],
      currentDate: publicSignals[13],
      timestampLowerbound: publicSignals[14],
      timestampUpperbound: publicSignals[15],
      identityCounterLowerbound: publicSignals[16],
      identityCounterUpperbound: publicSignals[17],
      birthDateLowerbound: publicSignals[18],
      birthDateUpperbound: publicSignals[19],
      expirationDateLowerbound: publicSignals[20],
      expirationDateUpperbound: publicSignals[21],
      citizenshipMask: publicSignals[22],
      passportHash,
      sessionKey,
      userAddress,
    };
  }

  /**
   * Build registration transaction
   */
  buildRegistrationTransaction(
    registrationData: RegistrationProofData
  ): UnsignedTransaction {
    const contract = new Contract(
      this.addresses.registration,
      REGISTRATION2_ABI,
      this.provider
    );

    const data = contract.interface.encodeFunctionData('registerViaNoir', [
      registrationData.certificatesRoot,
      registrationData.identityKey,
      registrationData.dgCommit,
      registrationData.passport,
      registrationData.zkPoints,
    ]);

    return {
      to: this.addresses.registration,
      data,
    };
  }

  /**
   * Build query proof transaction (for registered users)
   */
  async buildQueryProofTransaction(
    queryProof: QueryProofData,
    userAddress: string,
    sessionKey: string
  ): Promise<UnsignedTransaction> {
    // Get dates from blockchain (single fetch to avoid race conditions)
    const dates = await this.getBlockchainDates();

    const userPayload = this.abiCoder.encode(
      ['address', 'bytes32', 'bytes32', 'uint256'],
      [userAddress, sessionKey, sessionKey, dates.minExpirationEncoded]
    );

    const contract = new Contract(
      this.addresses.queryProofExecutor,
      QUERY_PROOF_EXECUTOR_ABI,
      this.provider
    );

    const data = contract.interface.encodeFunctionData('executeNoir', [
      dates.currentDateEncoded,
      userPayload,
      queryProof.zkPoints,
    ]);

    return {
      to: this.addresses.queryProofExecutor,
      data,
    };
  }

  /**
   * Build query proof transaction with registration (for unregistered users)
   */
  async buildQueryProofWithRegistrationTransaction(
    queryProof: QueryProofData,
    registrationData: RegistrationProofData,
    userAddress: string
  ): Promise<UnsignedTransaction> {
    // Get dates from blockchain (single fetch to avoid race conditions)
    const dates = await this.getBlockchainDates();

    const sessionKey = toBeHex(registrationData.identityKey, 32);
    const passportKeyHex = toBeHex(registrationData.passportKey, 32);

    // Extended userPayload with registration data
    // Passport tuple must be an array in order: dataType, zkType, signature, publicKey, passportHash
    const passportTuple = [
      registrationData.passport.dataType,
      registrationData.passport.zkType,
      registrationData.passport.signature,
      registrationData.passport.publicKey,
      registrationData.passport.passportHash,
    ];

    const userPayload = this.abiCoder.encode(
      [
        'address',
        'bytes32',
        'bytes32',
        'uint256',
        'bytes32',
        'uint256',
        'tuple(bytes32,bytes32,bytes,bytes,bytes32)',
        'bytes',
      ],
      [
        userAddress,
        sessionKey,
        passportKeyHex,
        dates.minExpirationEncoded,
        registrationData.certificatesRoot,
        registrationData.dgCommit,
        passportTuple,
        registrationData.zkPoints,
      ]
    );

    const contract = new Contract(
      this.addresses.queryProofExecutor,
      QUERY_PROOF_EXECUTOR_ABI,
      this.provider
    );

    const data = contract.interface.encodeFunctionData('executeNoir', [
      dates.currentDateEncoded,
      userPayload,
      queryProof.zkPoints,
    ]);

    return {
      to: this.addresses.queryProofExecutor,
      data,
    };
  }
}
