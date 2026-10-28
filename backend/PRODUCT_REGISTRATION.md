# Product registration integration

## Sepolia signing flow

1. A logged-in manufacturer links a MetaMask account by signing a short-lived backend challenge. The server stores only the verified public address, never a private key.
2. The manufacturer chooses an approved distributor and retailer. Their bound wallet addresses must also have the matching `ProductRegistry` roles on Sepolia.
3. `POST /api/products/prepare` validates those roles, allocates a product code, hashes the submitted metadata, and returns the `mintProduct` transaction request. It does not persist the product or send a transaction.
4. MetaMask signs and submits the transaction. The browser then posts the transaction hash, metadata, and reference image to `POST /api/products/confirm`.
5. The backend waits for one confirmation, checks the chain, sender, contract address, decoded arguments, `ProductMinted` event, and stored contract record. It creates the MongoDB product only after those checks pass.

The confirmation request can be retried with the same transaction hash if MongoDB is temporarily unavailable. A retry must use the same product fields and partner selections encoded in the confirmed transaction.

## Hash format

`productHash` is SHA-256 over the UTF-8 bytes of `JSON.stringify` applied to this object, with keys in this exact order:

```json
{
  "schemaVersion": 1,
  "productCode": "FPD0001",
  "manufacturerId": "MongoDB Manufacturer document ID",
  "productName": "trimmed name",
  "category": "trimmed category",
  "brandName": "trimmed brand",
  "batchNumber": "trimmed batch",
  "manufacturingDate": "UTC ISO-8601 date string",
  "price": null,
  "description": "trimmed description"
}
```

Price is a JSON number or `null`; optional description is an empty string when omitted. The contract receives the resulting 64-character lowercase hexadecimal SHA-256 digest without a `0x` prefix.

`imageHash` is a separate SHA-256 digest of the uploaded reference image bytes and is stored only in MongoDB. `ipfsImageHash` is the contract's CID field; it is deliberately an empty string in this implementation because IPFS is not integrated. The local file path is stored in MongoDB separately. Neither the image digest nor an IPFS CID is substituted for the product-data hash.

## Product IDs

An atomic MongoDB counter allocates `FPD` IDs. Existing Mongo product IDs initialize the counter, and the candidate is also checked against MongoDB and `getProduct` on Sepolia. Unused IDs may be skipped after canceled or failed registrations.
