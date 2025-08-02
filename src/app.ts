/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import * as grpc from '@grpc/grpc-js';
import {
    connect,
    Contract,
    hash,
    Identity,
    Signer,
    signers,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';

const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'basic');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');

// Path to crypto materials.
const cryptoPath = envOrDefault(
    'CRYPTO_PATH',
    path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'test-network',
        'organizations',
        'peerOrganizations',
        'org1.example.com'
    )
);

// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
    'KEY_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'keystore'
    )
);

// Path to user certificate directory.
const certDirectoryPath = envOrDefault(
    'CERT_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'signcerts'
    )
);

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
    'TLS_CERT_PATH',
    path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt')
);

// Gateway peer endpoint.
const peerEndpoint = envOrDefault('PEER_ENDPOINT', 'localhost:7051');

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault('PEER_HOST_ALIAS', 'peer0.org1.example.com');

const utf8Decoder = new TextDecoder();
let assetId = `asset${String(Math.floor(Math.random() * 10000000000))}`;

async function main(): Promise<void> {
    displayInputParameters();

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();

    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
        // Default timeouts for different gRPC calls
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });

    try {
        // Get a network instance representing the channel where the smart contract is deployed.
        const network = gateway.getNetwork(channelName);
        // Get the smart contract from the network.
        const contract = network.getContract(chaincodeName);
        // // Return all the current assets on the ledger.
        // await getAllAssets(contract);
        // // Create a new asset on the ledger.
        // await createAsset(contract);
        // // Update an existing asset asynchronously.
        // await transferAssetAsync(contract);
        // // Get the asset details by assetID.
        // await readAssetByID(contract);

        process.argv.forEach(async function (val, index, array) {
            if (val.indexOf('query=') != -1) {
                console.log(val);
                readAssetByName(contract, val.substring(6));
            }

            if (val.indexOf('vote=') != -1) {
                console.log(val);
                createAssetWithName(contract, val.substring(5));
            }

            if (val.indexOf('getAllVotes=true') != -1) {
                await getAllAssets(contract);
            }

            if (val.indexOf('initialize=true') != -1) {
                // Initialize a set of asset data on the ledger using the chaincode 'InitLedger' function.
                await initLedger(contract);
            }
        });
    } finally {
    }
}

main().catch((error: unknown) => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

async function newGrpcConnection(): Promise<grpc.Client> {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity(): Promise<Identity> {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function getFirstDirFileName(dirPath: string): Promise<string> {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newSigner(): Promise<Signer> {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

/**
 * This type of transaction would typically only be run once by an application the first time it was started after its
 * initial deployment. A new version of the chaincode deployed later would likely not need to run an "init" function.
 */
async function initLedger(contract: Contract): Promise<void> {
    console.log(
        '\n--> Submit Transaction: InitLedger, function creates the initial set of assets on the ledger'
    );

    assetId = `asset${String(Math.floor(Math.random() * 10000000000))}`;
    try {
        await contract.submitTransaction(
            'CreateAsset',
            assetId,
            '',
            '1',
            'Tom',
            ''
        );
    } catch (error) {
        console.log(error);
        console.log('Tom already created');
    }

    assetId = `asset${String(Math.floor(Math.random() * 10000000000))}`;
    try {
        await contract.submitTransaction(
            'CreateAsset',
            assetId,
            '',
            '2',
            'Cat',
            ''
        );
    } catch (error) {
        console.log(error);
        console.log('Cat already created');
    }

    assetId = `asset${String(Math.floor(Math.random() * 10000000000))}`;
    try {
        await contract.submitTransaction(
            'CreateAsset',
            assetId,
            '',
            '2',
            'Dog',
            ''
        );
    } catch (error) {
        console.log(error);
        console.log('Dog already created');
    }

    console.log('*** Transaction committed successfully');
}

/**
 * Evaluate a transaction to query ledger state.
 */
async function getAllAssets(contract: Contract): Promise<void> {
    console.log(
        '\n--> Evaluate Transaction: GetAllAssets, function returns all the current assets on the ledger'
    );

    const resultBytes = await contract.evaluateTransaction('GetAllAssets');

    const resultJson = utf8Decoder.decode(resultBytes);
    const result: unknown = JSON.parse(resultJson);
    console.log('*** Result:', result);
}

/**
 * Submit a transaction synchronously, blocking until it has been committed to the ledger.
 */
// async function createAsset(contract: Contract): Promise<void> {
//     console.log(
//         '\n--> Submit Transaction: CreateAsset, creates new asset with ID, Color, Size, Owner and AppraisedValue arguments'
//     );

//     await contract.submitTransaction(
//         'CreateAsset',
//         assetId,
//         'yellow',
//         '5',
//         'Tom',
//         '1300'
//     );

//     console.log('*** Transaction committed successfully');
// }

/**
 * Create an entry for the new candidate or add 1 vote to the candidate specified.
 */
async function createAssetWithName(contract: Contract, name: string) {
    console.log(
        '\n--> Submit Transaction: CreateAsset, creates new asset with ID, Color, Size, Owner and AppraisedValue arguments'
    );
    let exists: boolean = false;

    const resultBytes = await contract.evaluateTransaction('GetAllAssets');
    let size: string = '';
    let assetIdIfExists: string = '';

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    for (const key in result) {
        // console.log(`${key} : ${result[key].Owner}`);
        const owner: string = result[key].Owner.toString();
        if (owner.indexOf(name) != -1) {
            // console.log(
            //     'Previous Candidate Search Result: ' +
            //         result[key].AppraisedValue +
            //         ' ' +
            //         result[key].Color +
            //         ' ' +
            //         result[key].ID +
            //         ' ' +
            //         result[key].Owner +
            //         ' ' +
            //         result[key].Size
            // );
            size = (result[key].Size + 1).toString();
            assetIdIfExists = result[key].ID.toString();
            exists = true;

            break;
        }
    }

    if (exists) {
        await contract.submitTransaction(
            'UpdateAsset',
            assetIdIfExists,
            '',
            size,
            name,
            ''
        );

        // console.log('name: ' + name + ' votes: ' + size);
        console.log('*** Transaction committed successfully - update');
    } else {
        assetId = `asset${String(Math.floor(Math.random() * 10000000000))}`;

        await contract.submitTransaction(
            'CreateAsset',
            assetId,
            '',
            '1',
            name,
            ''
        );

        console.log('*** Transaction committed successfully - creation');
    }
}

/**
 * Submit transaction asynchronously, allowing the application to process the smart contract response (e.g. update a UI)
 * while waiting for the commit notification.
 */
// async function transferAssetAsync(contract: Contract): Promise<void> {
//     console.log(
//         '\n--> Async Submit Transaction: TransferAsset, updates existing asset owner'
//     );

//     const commit = await contract.submitAsync('TransferAsset', {
//         arguments: [assetId, 'Saptha'],
//     });
//     const oldOwner = utf8Decoder.decode(commit.getResult());

//     console.log(
//         `*** Successfully submitted transaction to transfer ownership from ${oldOwner} to Saptha`
//     );
//     console.log('*** Waiting for transaction commit');

//     const status = await commit.getStatus();
//     if (!status.successful) {
//         throw new Error(
//             `Transaction ${
//                 status.transactionId
//             } failed to commit with status code ${String(status.code)}`
//         );
//     }

//     console.log('*** Transaction committed successfully');
// }

// async function readAssetByID(contract: Contract): Promise<void> {
//     console.log(
//         '\n--> Evaluate Transaction: ReadAsset, function returns asset attributes'
//     );

//     const resultBytes = await contract.evaluateTransaction(
//         'ReadAsset',
//         assetId
//     );

//     const resultJson = utf8Decoder.decode(resultBytes);
//     const result: unknown = JSON.parse(resultJson);
//     console.log('*** Result:', result);
// }

async function readAssetByName(
    contract: Contract,
    name: string
): Promise<void> {
    console.log(
        '\n--> Evaluate Transaction: ReadAsset, function returns asset attributes'
    );

    const resultBytes = await contract.evaluateTransaction('GetAllAssets');

    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    for (const key in result) {
        console.log(`${key} : ${result[key].Owner}`);
        const owner: string = result[key].Owner;
        if (owner.indexOf(name) != -1) {
            console.log(
                'Query Result: ' +
                    result[key].AppraisedValue +
                    ' ' +
                    result[key].Color +
                    ' ' +
                    result[key].ID +
                    ' ' +
                    result[key].Owner +
                    ' ' +
                    result[key].Size
            );
            break;
        }
    }
}

/**
 * submitTransaction() will throw an error containing details of any error responses from the smart contract.
 */
// async function updateNonExistentAsset(contract: Contract): Promise<void> {
//     console.log(
//         '\n--> Submit Transaction: UpdateAsset asset70, asset70 does not exist and should return an error'
//     );

//     try {
//         await contract.submitTransaction(
//             'UpdateAsset',
//             'asset70',
//             'blue',
//             '5',
//             'Tomoko',
//             '300'
//         );
//         console.log('******** FAILED to return an error');
//     } catch (error) {
//         console.log('*** Successfully caught the error: \n', error);
//     }
// }

/**
 * envOrDefault() will return the value of an environment variable, or a default value if the variable is undefined.
 */
function envOrDefault(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
}

/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
function displayInputParameters(): void {
    console.log(`channelName:       ${channelName}`);
    console.log(`chaincodeName:     ${chaincodeName}`);
    console.log(`mspId:             ${mspId}`);
    console.log(`cryptoPath:        ${cryptoPath}`);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
    console.log(`certDirectoryPath: ${certDirectoryPath}`);
    console.log(`tlsCertPath:       ${tlsCertPath}`);
    console.log(`peerEndpoint:      ${peerEndpoint}`);
    console.log(`peerHostAlias:     ${peerHostAlias}`);
}
