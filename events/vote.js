const steem = require('steem');
const _ = require('lodash');
const fetch = require('node-fetch');

const utils = require('../helpers/utils');
const client = require('../helpers/redis');

fetch.Promise = require('bluebird');

const username = process.env.STEEM_USERNAME;
const postingWif = process.env.STEEM_POSTING_WIF;
const delay = parseInt(process.env.STEEM_VOTE_DELAY || 21600);

const MIN_VESTS = 10000000; // Dolphin
const MAX_VESTS = 5000000000; // 5 Whales

const calculateVotingPower = async (username) => {
  const url = `https://steemdb.com/api/accounts?account[]=${username}`;
  let votingPower = 0;
  try {
    const [account] = await fetch(url).then(res => res.json());
    votingPower = account.followers_mvest >= MIN_VESTS ? parseFloat(10000 / MAX_VESTS * account.followers_mvest) : 0;
    votingPower = votingPower > 10000 ? 10000 : parseInt(votingPower);
  } catch (e) {
    console.log(e);
  }
  return votingPower;
};

/** Detect post from Busy and vote for it */
const trigger = async (op) => {
  if (op[0] === 'comment' && op[1].parent_author === '') {
    let jsonMetadata;
    try {
      jsonMetadata = JSON.parse(op[1].json_metadata);
    } catch (err) {
    }

    if (
      jsonMetadata
      && jsonMetadata.app
      && typeof jsonMetadata.app === 'string'
      && jsonMetadata.app.includes('busy') // Must have 'busy/' as app
      && jsonMetadata.tags
      && !jsonMetadata.tags.includes('test') // Must not include tag 'test'
      && jsonMetadata.tags.includes('busy') // Must include tag 'busy'
    ) {

      const hasVote = await client.getAsync(`${op[1].author}:hasVote`);
      if (!hasVote && !op[1].body.includes('@@')) {
        const weight = await calculateVotingPower(op[1].author);
        try {
          const result = await steem.broadcast.voteWithAsync(postingWif, {
            voter: username,
            author: op[1].author,
            permlink: op[1].permlink,
            weight,
          });

          await client.setAsync(`${op[1].author}:hasVote`, 'true', 'EX', delay);
          console.log('Vote success', op[1].author, op[1].permlink, result);
        } catch (err) {
          console.log('Vote error', op[1].author, op[1].permlink, err);
        }
        await utils.sleep(4000);
      } else {
        console.log('Has already vote', op[1].author, op[1].permlink);
      }
    }
  }
};

module.exports = trigger;
