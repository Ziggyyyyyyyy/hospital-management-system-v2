import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
} from '../lib/crypto/vault'

describe('Security Vault (AES-256-GCM Cryptography)', () => {
  it('successfully encrypts and decrypts sensitive plain text (round-trip)', () => {
    const plainText = 'google_oauth_refresh_token_xyz_12345_very_secret'
    const encrypted = encryptSecret(plainText)

    expect(encrypted).toBeDefined()
    expect(encrypted).not.toBe(plainText)
    expect(encrypted.startsWith('v1:')).toBe(true)

    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(plainText)
  })

  it('generates unique initialization vectors (IVs) for identical inputs', () => {
    const secret = 'same_secret_token_content'
    const enc1 = encryptSecret(secret)
    const enc2 = encryptSecret(secret)

    expect(enc1).not.toBe(enc2) // Different IV and Auth Tag
    expect(decryptSecret(enc1)).toBe(secret)
    expect(decryptSecret(enc2)).toBe(secret)
  })

  it('handles empty string gracefully', () => {
    expect(encryptSecret('')).toBe('')
    expect(decryptSecret('')).toBe('')
  })

  it('rejects tampered ciphertext with GCM authentication tag failure', () => {
    const secret = 'highly_confidential_patient_phi_data'
    const encrypted = encryptSecret(secret)
    const parts = encrypted.split(':')
    expect(parts.length).toBe(4)

    // Tamper with the ciphertext byte stream
    const rawCipher = Buffer.from(parts[3], 'base64')
    rawCipher[0] = rawCipher[0] ^ 0xff // flip bits in first byte
    const tamperedPayload = [
      parts[0],
      parts[1],
      parts[2],
      rawCipher.toString('base64'),
    ].join(':')

    const result = decryptSecret(tamperedPayload)
    expect(result).toBe('') // Decryption fails authentication check
  })

  it('rejects tampered authentication tag', () => {
    const secret = 'token_for_calendar_service'
    const encrypted = encryptSecret(secret)
    const parts = encrypted.split(':')

    // Tamper with the authentication tag
    const rawTag = Buffer.from(parts[2], 'base64')
    rawTag[0] = rawTag[0] ^ 0x01
    const tamperedPayload = [
      parts[0],
      parts[1],
      rawTag.toString('base64'),
      parts[3],
    ].join(':')

    const result = decryptSecret(tamperedPayload)
    expect(result).toBe('')
  })

  it('correctly identifies valid and invalid encrypted envelopes with isEncryptedSecret', () => {
    const valid = encryptSecret('some_token')
    expect(isEncryptedSecret(valid)).toBe(true)
    expect(isEncryptedSecret('plain_text_token')).toBe(false)
    expect(isEncryptedSecret('v2:invalid:envelope')).toBe(false)
    expect(isEncryptedSecret('')).toBe(false)
  })

  it('fails decryption when using a different master key', () => {
    const key1 = crypto.createHash('sha256').update('key-one-secret').digest()
    const key2 = crypto.createHash('sha256').update('key-two-secret').digest()

    const secret = 'secret_message_for_key_one'
    const encrypted = encryptSecret(secret, key1)

    // Decrypt with correct key
    expect(decryptSecret(encrypted, key1)).toBe(secret)

    // Decrypt with wrong key
    expect(decryptSecret(encrypted, key2)).toBe('')
  })
})
