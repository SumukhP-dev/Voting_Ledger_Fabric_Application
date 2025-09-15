# Voting Ledger Based System

## Summary

This is a codebase about building ontop of the Fabric Application codebase and creating a system to track votes on a ledger based system.

## Prerequistes

Go to https://hyperledger-fabric.readthedocs.io/en/latest/getting_started.html and go through the installation guidelines to install the relevant software required to run the project codebase. Then install Node.js and the Go programming language.

## Further instructions

Follow the instructions to start channels, etc
https://hyperledger-fabric.readthedocs.io/en/latest/write_first_app.html

Run npm install and then npm start

For different interactions:
Initialize
npm start initialize=true

Query:
npm start query={name}

Vote:
npm start vote={name}

Get all votes:
npm start getAllVotes=true


