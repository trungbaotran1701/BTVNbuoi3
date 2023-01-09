// Find all our documentation at https://docs.near.org
import { NearBindgen, near, call, view, initialize, LookupMap, assert } from 'near-sdk-js';
import { AccountId } from 'near-sdk-js/lib/types';

class Token {
  token_id: number;
  owner_id: AccountId;
  name: string;
  description: string;
  media_uri: string;
  level: number;
  constructor(token_id: number, owner_id: AccountId, name: string, description: string, media_uri: string, level: number) {
    (this.token_id = token_id),
      (this.owner_id = owner_id),
      (this.name = name),
      (this.description = description),
      (this.media_uri = media_uri),
      (this.level = level);
  }
}

@NearBindgen({})
class Contract {
  owner_id: AccountId;
  token_id: number;
  owner_by_id: LookupMap<string>;
  token_by_id: LookupMap<Token>;
  constructor() {
    this.token_id = 0;
    this.owner_id = "";
    this.owner_by_id = new LookupMap('o')
    this.token_by_id = new LookupMap('t')
  }
  @initialize({})
  init({ owner_id, prefix }: { owner_id: AccountId; prefix:string }) {
    this.token_id = 0;
    this.owner_id = owner_id;
    this.owner_by_id = new LookupMap(prefix);
    this.token_by_id = new LookupMap('t')
  }

  @call({})
  mint_nft({ token_owner_id, name, description, media_uri, level }) {
    this.owner_by_id.set(this.token_id.toString(), token_owner_id);
    let token = new Token(this.token_id, token_owner_id, name, description, media_uri, level);

    this.token_by_id.set(this.token_id.toString(), token)

    this.token_id++;

    return token
  }

  @view({})
  get_token_by_id({ token_id }: { token_id: number }) {
    let token = this.token_by_id.get(token_id.toString());

    if (token === null) {
      return null;
    }
    return token
  }

  @view({})
  get_supply_tokens() {
    return this.token_id;
  }

  @view({})
  get_all_tokens({ start, max }: { start ?: number;  max?:number}) {
    var all_tokens = []
    
    for (var i = 0; i < this.token_id; i++){
      all_tokens.push(this.token_by_id.get(i.toString()));
    }

    return all_tokens;
  }

  internalTransfer({
    sender_id,
    receiver_id,
    token_id,
    approval_id,
    memo
  }) {
    let owner_id = this.owner_by_id.get(token_id)
    assert(owner_id !== null, "Token not found");
    assert(sender_id === owner_id, "Sender must be the current owner");
    assert(owner_id !== receiver_id, "Current and next owner must differ");

    this.owner_by_id.set(token_id, receiver_id);

    return owner_id;
  }

  @call({})
  nftTransfer({ receiver_id, token_id, approval_id, memo }) {
     let sender_id = near.predecessorAccountId();
      this.internalTransfer({
      sender_id,
      receiver_id,
      token_id,
      approval_id,
      memo,
    });
  }

  @call({})
  nftTransferCall({ receiver_id, token_id, approval_id, memo, msg }) {
    near.log(
      `nftTransferCall called, receiver_id ${receiver_id}, token_id ${token_id}`
    );
    let sender_id = near.predecessorAccountId();
    let old_owner_id = this.internalTransfer({
      sender_id,
      receiver_id,
      token_id,
      approval_id,
      memo,
    });

    const promise = near.promiseBatchCreate(receiver_id);
    near.promiseBatchActionFunctionCall(
      promise,
      "nftOnTransfer",
        JSON.stringify({
          senderId: sender_id,
          previousOwnerId: old_owner_id,
          tokenId: token_id,
          msg: msg,
        }),
      0,
      30000000000000
    );
    near.promiseThen(
      promise,
      near.currentAccountId(),
      "_nftResolveTransfer",
      JSON.stringify({ sender_id, receiver_id, token_id }),
      0,
      30000000000000
    );
  }

  @call({ privateFunction: true })
  _nftResolveTransfer({ sender_id, receiver_id, token_id }) {
    near.log(
      `_nftResolveTransfer called, receiver_id ${receiver_id}, token_id ${token_id}`
    );
    const isTokenTransfered = JSON.parse(near.promiseResult(0));
    near.log(
      `${token_id} ${
        isTokenTransfered ? "was transfered" : "was NOT transfered"
      }`
    );

    if (!isTokenTransfered) {
      near.log(`Returning ${token_id} to ${receiver_id}`);
      const currentOwner = this.owner_by_id.get(token_id);
      if (currentOwner === receiver_id) {
        this.internalTransfer({
          sender_id: receiver_id,
          receiver_id: sender_id,
          token_id: token_id,
          approval_id: null,
          memo: null,
        });
        near.log(`${token_id} returned to ${sender_id}`);
        return;
      }
      near.log(
        `Failed to return ${token_id}. It was burned or not owned by ${receiver_id} now.`
      );
    }
  }

}
