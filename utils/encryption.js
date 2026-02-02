const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.WALLETREACH_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('WALLETREACH_ENCRYPTION_KEY must be exactly 32 characters');
}

/**
 * Encrypt a private key using AES-256
 * @param {string} privateKey - The private key to encrypt
 * @returns {string} - Encrypted private key
 */
const encryptPrivateKey = (privateKey) => {
    if (!privateKey) {
        throw new Error('Private key is required for encryption');
    }

    const encrypted = CryptoJS.AES.encrypt(privateKey, ENCRYPTION_KEY).toString();
    return encrypted;
};

/**
 * Decrypt a private key using AES-256
 * @param {string} encryptedKey - The encrypted private key
 * @returns {string} - Decrypted private key
 */
const decryptPrivateKey = (encryptedKey) => {
    if (!encryptedKey) {
        throw new Error('Encrypted key is required for decryption');
    }

    try {
        const bytes = CryptoJS.AES.decrypt(encryptedKey, ENCRYPTION_KEY);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);

        if (!decrypted) {
            throw new Error('Decryption failed - invalid key or encryption');
        }

        return decrypted;
    } catch (error) {
        throw new Error(`Decryption failed: ${error.message}`);
    }
};

module.exports = {
    encryptPrivateKey,
    decryptPrivateKey,
};
