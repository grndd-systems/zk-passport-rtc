import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useWebRTCWithFirebase, generatePeerId } from '@grndd-systems/zk-proof-rtc'
import { ContractClient, isValidRegistrationProofData, safeBigInt } from '@grndd-systems/zk-passport-client'
import { JsonRpcProvider, BrowserProvider } from 'ethers'
import { firebaseConfig, contractAddresses, rpcUrl, chainId } from './config'

interface RegistrationProofData {
  certificatesRoot: `0x${string}`
  identityKey: bigint
  dgCommit: bigint
  passportKey: bigint
  passport: {
    dataType: `0x${string}`
    zkType: `0x${string}`
    signature: `0x${string}`
    publicKey: `0x${string}`
    passportHash: `0x${string}`
  }
  zkPoints: `0x${string}`
}

export default function App() {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'received' | 'signing' | 'sent' | 'error'>('idle')
  const [registrationData, setRegistrationData] = useState<RegistrationProofData | null>(null)
  const [queryZkPoints, setQueryZkPoints] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const offerCreatedRef = useRef(false)

  // WebRTC connection
  const { state, createOffer, onMessage, send } = useWebRTCWithFirebase({
    firebaseConfig,
    webrtcConfig: { debug: true },
  })

  // Contract client (read-only for fetching params)
  const contractClient = useMemo(() => {
    const provider = new JsonRpcProvider(rpcUrl)
    return new ContractClient(provider, contractAddresses, { debug: true })
  }, [])

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask not installed')
      return
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      setWalletAddress(accounts[0])
      setStatus('waiting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
    }
  }, [])

  // Send registration transaction
  const sendTransaction = useCallback(async () => {
    if (!registrationData || !window.ethereum) return

    setStatus('signing')
    setError(null)

    try {
      const provider = new BrowserProvider(window.ethereum)

      // Check current chain
      const network = await provider.getNetwork()
      const currentChainId = Number(network.chainId)

      console.log('Current chainId:', currentChainId, 'Expected:', chainId)

      // Switch network if needed
      if (currentChainId !== chainId) {
        console.log('Switching to chainId:', chainId)
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          })
        } catch (switchError: any) {
          // Chain not added, try to add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${chainId.toString(16)}`,
                chainName: 'Eden Testnet',
                rpcUrls: ['https://ev-reth-eden-testnet.binarybuilders.services:8545'],
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                blockExplorerUrls: ['https://explorer-eden-testnet.binarybuilders.services']
              }],
            })
          } else {
            throw switchError
          }
        }
      }

      const signer = await provider.getSigner()

      // Build the transaction using ContractClient
      // If we have queryZkPoints, use combined registration + query proof transaction
      let tx
      if (queryZkPoints && walletAddress) {
        console.log('Building combined registration + query proof transaction')
        tx = await contractClient.buildQueryProofWithRegistrationTransaction(
          { zkPoints: queryZkPoints },
          registrationData,
          walletAddress
        )
      } else {
        console.log('Building registration-only transaction')
        tx = contractClient.buildRegistrationTransaction(registrationData)
      }

      console.log('Sending transaction:', tx)

      // Send transaction
      const txResponse = await signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
      })

      console.log('Transaction sent:', txResponse.hash)
      setTxHash(txResponse.hash)
      setStatus('sent')

      // Wait for confirmation
      await txResponse.wait()
      console.log('Transaction confirmed!')
    } catch (err) {
      console.error('Transaction error:', err)
      setError(err instanceof Error ? err.message : 'Transaction failed')
      setStatus('error')
    }
  }, [registrationData, queryZkPoints, walletAddress, contractClient])

  // Handle incoming messages
  useEffect(() => {
    onMessage(async (data) => {
      console.log('Received:', data)

      try {
        // Handle passport keys - fetch contract params and send back
        if (data.type === 'passport_keys' && data.data) {
          const { passportKey, identityKey } = data.data

          const passportKeyBigInt = safeBigInt(passportKey, 'passportKey')
          const identityKeyBigInt = safeBigInt(identityKey, 'identityKey')

          if (!passportKeyBigInt || !identityKeyBigInt) {
            throw new Error('Invalid passport keys')
          }

          const passportHash = `0x${passportKeyBigInt.toString(16).padStart(64, '0')}` as `0x${string}`
          const sessionKey = `0x${identityKeyBigInt.toString(16).padStart(64, '0')}` as `0x${string}`

          // Get contract params using connected wallet address
          const params = await contractClient.getQueryProofParams(
            passportHash,
            sessionKey,
            walletAddress || '0x0000000000000000000000000000000000000000'
          )

          if (params) {
            const toHex = (value: bigint | number): string => '0x' + BigInt(value).toString(16)

            const payload = {
              type: 'query_proof_params',
              data: {
                id: `event_${Date.now()}`,
                needs_registration: true,
                user_address: walletAddress || '0x0000000000000000000000000000000000000000',
                attributes: {
                  birth_date_lower_bound: toHex(params.birthDateLowerbound),
                  birth_date_upper_bound: toHex(params.birthDateUpperbound),
                  citizenship_mask: toHex(params.citizenshipMask),
                  current_date: toHex(params.currentDate),
                  event_data: toHex(params.eventData),
                  event_id: toHex(params.eventID),
                  expiration_date_lower_bound: toHex(params.expirationDateLowerbound),
                  expiration_date_upper_bound: toHex(params.expirationDateUpperbound),
                  identity_counter: 0,
                  identity_counter_lower_bound: toHex(params.identityCounterLowerbound),
                  identity_counter_upper_bound: toHex(params.identityCounterUpperbound),
                  selector: toHex(params.selector),
                  timestamp_lower_bound: toHex(params.timestampLowerbound),
                  timestamp_upper_bound: toHex(params.timestampUpperbound),
                },
              },
            }

            send(payload)
            console.log('Sent contract params to mobile')
          }
          return
        }

        // Handle query_proof with registration data
        if (data.type === 'query_proof' && data.data?.registration) {
          const registration = data.data.registration

          if (!isValidRegistrationProofData(registration)) {
            throw new Error('Invalid registration data')
          }

          const identityKey = safeBigInt(registration.identityKey, 'identityKey')
          const dgCommit = safeBigInt(registration.dgCommit, 'dgCommit')
          const passportKey = safeBigInt(registration.passportKey, 'passportKey')

          if (!identityKey || !dgCommit || !passportKey) {
            throw new Error('Failed to convert BigInt values')
          }

          setRegistrationData({
            certificatesRoot: registration.certificatesRoot as `0x${string}`,
            identityKey,
            dgCommit,
            passportKey,
            passport: {
              dataType: registration.passport.dataType as `0x${string}`,
              zkType: registration.passport.zkType as `0x${string}`,
              signature: registration.passport.signature as `0x${string}`,
              publicKey: registration.passport.publicKey as `0x${string}`,
              passportHash: registration.passport.passportHash as `0x${string}`,
            },
            zkPoints: registration.zkPoints as `0x${string}`,
          })

          // Capture query proof zkPoints if present (for combined registration + query)
          if (data.data.zkPoints) {
            setQueryZkPoints(data.data.zkPoints as `0x${string}`)
            console.log('Query proof zkPoints received!')
          }

          setStatus('received')
          console.log('Registration data received!')
        }
      } catch (err) {
        console.error('Error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      }
    })
  }, [onMessage, send, contractClient, walletAddress])

  // Auto-create offer when wallet connected
  useEffect(() => {
    if (walletAddress && !offerCreatedRef.current && state.state === 'idle' && !state.peerId) {
      offerCreatedRef.current = true
      const peerId = generatePeerId()
      createOffer(peerId).catch((err) => {
        console.error('Failed to create offer:', err)
        offerCreatedRef.current = false
      })
    }
  }, [walletAddress, state.state, state.peerId, createOffer])

  // Build QR code URL
  const qrUrl = useMemo(() => {
    if (!state.peerId) return null

    const params = {
      peerId: state.peerId,
      type: 'registration',
    }

    // Check if we should use emulator (default to true in dev)
    const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true' ||
                        (import.meta.env.VITE_USE_EMULATOR === undefined && import.meta.env.DEV)

    if (useEmulator) {
      // Browser-based emulator for development/testing
      const emulatorUrl = import.meta.env.VITE_EMULATOR_URL || 'http://localhost:5174/public/emulator-firebase.html'
      return `${emulatorUrl}#${btoa(JSON.stringify(params))}`
    } else {
      // Native mobile app deep link for production
      return `zkpassport://connect?${new URLSearchParams(params as any).toString()}`
    }
  }, [state.peerId])

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>ZK Passport Registration</h1>

      {/* Errors */}
      {(state.error || error) && (
        <div style={{ color: 'red', marginBottom: '1rem', padding: '0.5rem', background: '#fee', borderRadius: '4px' }}>
          {state.error?.message || error}
        </div>
      )}

      {/* Connect Wallet */}
      {status === 'idle' && (
        <button
          onClick={connectWallet}
          style={{
            padding: '1rem 2rem',
            fontSize: '1rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Connect Wallet
        </button>
      )}

      {/* Wallet connected - show address */}
      {walletAddress && (
        <p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '1rem' }}>
          Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </p>
      )}

      {/* QR Code */}
      {status === 'waiting' && qrUrl && (
        <div>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            {state.isConnected ? 'Connected! Waiting for proof...' : 'Scan QR code with mobile app'}
          </p>
          <QRCodeSVG value={qrUrl} size={250} level="H" includeMargin />
        </div>
      )}

      {/* Proof Received - Show Sign Button */}
      {status === 'received' && registrationData && (
        <div>
          <p style={{ color: 'green', marginBottom: '1rem' }}>
            {queryZkPoints
              ? 'Registration + Query proof received!'
              : 'Registration proof received!'}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '1rem' }}>
            {queryZkPoints
              ? 'Transaction will go to QueryProofExecutor (combined)'
              : 'Transaction will go to Registration contract'}
          </p>
          <button
            onClick={sendTransaction}
            style={{
              padding: '1rem 2rem',
              fontSize: '1rem',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Sign & Send Transaction
          </button>
        </div>
      )}

      {/* Signing */}
      {status === 'signing' && (
        <p style={{ color: '#666' }}>Please confirm transaction in your wallet...</p>
      )}

      {/* Transaction Sent */}
      {status === 'sent' && txHash && (
        <div style={{ color: 'green' }}>
          <p>Transaction sent!</p>
          <p style={{ fontSize: '0.75rem', wordBreak: 'break-all', maxWidth: '400px', margin: '0.5rem auto' }}>
            {txHash}
          </p>
        </div>
      )}

      {/* Initializing */}
      {walletAddress && !qrUrl && status === 'waiting' && !state.error && (
        <p style={{ color: '#666' }}>Initializing...</p>
      )}
    </div>
  )
}

// TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on?: (event: string, callback: (...args: unknown[]) => void) => void
    }
  }
}
