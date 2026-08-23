import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const TAG_LENGTH = 16 // 128-bit authentication tag
const FORMAT_PREFIX = 'v1'

/**
 * Derives a 256-bit cryptographic key from environment variables.
 */
function getDerivedMasterKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_MASTER_KEY ||
    process.env.ENCRYPTION_SALT ||
    'hospital-management-system-v2-master-key-seed-production-secure'
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypts a plaintext secret using AES-256-GCM with authenticated tags.
 * Output format: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`
 */
export function encryptSecret(plainText: string, keyOverride?: Buffer): string {
  if (plainText === '') return ''
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = keyOverride ?? getDerivedMasterKey()

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    FORMAT_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * Decrypts a payload encrypted with `encryptSecret`.
 * Returns the decrypted plaintext string, or empty string / throws if tampered.
 */
export function decryptSecret(
  cipherPayload: string,
  keyOverride?: Buffer,
): string {
  if (!cipherPayload) return ''

  // Backwards compatibility / format verification
  const parts = cipherPayload.split(':')
  if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) {
    // If not matching v1 AES-GCM envelope, check if it was legacy format or invalid
    return ''
  }

  const [, ivB64, tagB64, dataB64] = parts

  try {
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const encryptedData = Buffer.from(dataB64, 'base64')
    const key = keyOverride ?? getDerivedMasterKey()

    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      return ''
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    })
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch (err) {
    // Authentication failed (tampered ciphertext or auth tag) or invalid key
    return ''
  }
}

/**
 * Checks if a string is a valid v1 encrypted secret envelope.
 */
export function isEncryptedSecret(payload: string): boolean {
  if (!payload || typeof payload !== 'string') return false
  const parts = payload.split(':')
  return parts.length === 4 && parts[0] === FORMAT_PREFIX
}
