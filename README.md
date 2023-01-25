# I TAKE NO RESPONSIBILITY FOR THIS CODE

# USE AT YOUR OWN RISK

## How To Basic

```
1. Replace the mnemonics in config.ts with yours
$ git clone https://github.com/Lutwidse/dexbot-kujira-cosmos
$ cd dexbot-kujira-cosmos
$ npm i
$ ./node_modules/.bin/ts-node ./src/main.ts
```

## FAQ

Q. Why am I getting the 502 status error after polling RPC for some hours?  
A. Yes, I'm aware of that. I've talked with Hans. Thanks to him and Setten.  
This problem is caused by someone else who is sending the big query to the node operators, thus node crashes for a bit. Due to this problem, there is some possibility of lose logging and all on-chain actions through the bot.  
For e.g. the bot successfully claimed bids but failed swaps, so ATOM is in your wallets maybe you don't notice then you lose money since of the price move.  
To clear this problem, you have to run a node yourself or edit the code to ignore price impact and swap.  
[Reference](../../tree/7677d231b9cd7a96f525128c05598895e0199a8b/src/main.ts#L117)
