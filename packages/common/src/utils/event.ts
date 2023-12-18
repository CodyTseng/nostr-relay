import { isNil } from 'lodash';
import { EventKind, EventType, TagName } from '../enums';
import { Event, Filter, Tag } from '../interfaces';
import { schnorrVerify, sha256 } from './crypto';
import { countPowDifficulty } from './proof-of-work';
import { getTimestampInSeconds } from './time';

export class EventUtils {
  static getType({ kind }: Event): EventType {
    if (
      [
        EventKind.SET_METADATA,
        EventKind.CONTACT_LIST,
        EventKind.CHANNEL_METADATA,
      ].includes(kind) ||
      (kind >= EventKind.REPLACEABLE_FIRST &&
        kind <= EventKind.REPLACEABLE_LAST)
    ) {
      return EventType.REPLACEABLE;
    }

    if (kind >= EventKind.EPHEMERAL_FIRST && kind <= EventKind.EPHEMERAL_LAST) {
      return EventType.EPHEMERAL;
    }

    if (
      kind >= EventKind.PARAMETERIZED_REPLACEABLE_FIRST &&
      kind <= EventKind.PARAMETERIZED_REPLACEABLE_LAST
    ) {
      return EventType.PARAMETERIZED_REPLACEABLE;
    }

    return EventType.REGULAR;
  }

  static validate(
    event: Event,
    options: {
      createdAtUpperLimit?: number;
      createdAtLowerLimit?: number;
      minPowDifficulty?: number;
    } = {},
  ): string | undefined {
    if (!EventUtils.isIdValid(event)) {
      return 'invalid: id is wrong';
    }

    if (!EventUtils.isSigValid(event)) {
      return 'invalid: signature is wrong';
    }

    const now = getTimestampInSeconds();

    const expiredAt = EventUtils.extractExpirationTimestamp(event);
    if (expiredAt && expiredAt < now) {
      return 'reject: event is expired';
    }

    if (
      !isNil(options.createdAtUpperLimit) &&
      event.created_at - now > options.createdAtUpperLimit
    ) {
      return `invalid: created_at must not be later than ${options.createdAtUpperLimit} seconds from the current time`;
    }

    if (
      !isNil(options.createdAtLowerLimit) &&
      now - event.created_at > options.createdAtLowerLimit
    ) {
      return `invalid: created_at must not be earlier than ${options.createdAtLowerLimit} seconds from the current time`;
    }

    if (options.minPowDifficulty && options.minPowDifficulty > 0) {
      const pow = countPowDifficulty(event.id);
      if (pow < options.minPowDifficulty) {
        return `pow: difficulty ${pow} is less than ${options.minPowDifficulty}`;
      }

      const nonceTag = event.tags.find(
        tag => tag[0] === TagName.NONCE && tag.length === 3,
      );
      if (!nonceTag) {
        // could not reject an event without a committed target difficulty
        return;
      }

      const targetPow = parseInt(nonceTag[2]);
      if (isNaN(targetPow) || targetPow < options.minPowDifficulty) {
        return `pow: difficulty ${targetPow} is less than ${options.minPowDifficulty}`;
      }
    }

    if (!EventUtils.isDelegationEventValid(event)) {
      return 'invalid: delegation tag verification failed';
    }
  }

  static isIdValid(event: Event) {
    return (
      sha256([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
      ]) === event.id
    );
  }

  static isSigValid(event: Event) {
    return schnorrVerify(event.sig, event.id, event.pubkey);
  }

  static isDelegationEventValid(event: Event) {
    const delegationTag = EventUtils.extractDelegationTag(event);
    if (!delegationTag) return true;

    if (delegationTag.length !== 4) {
      return false;
    }
    const [, delegator, conditionsStr, token] = delegationTag;

    const delegationStr = sha256(
      `nostr:delegation:${event.pubkey}:${conditionsStr}`,
    );

    if (!schnorrVerify(token, delegationStr, delegator)) {
      return false;
    }

    return conditionsStr.split('&').every(conditionStr => {
      const operatorIndex = conditionStr.search(/[=><]/);
      if (operatorIndex < 0) {
        return false;
      }

      const operator = conditionStr[operatorIndex];
      const attribute = conditionStr.slice(0, operatorIndex);
      const value = parseInt(conditionStr.slice(operatorIndex + 1));

      if (isNaN(value)) {
        return false;
      }
      if (attribute === 'kind' && operator === '=') {
        return event.kind === value;
      }
      if (attribute === 'created_at' && operator === '>') {
        return event.created_at > value;
      }
      if (attribute === 'created_at' && operator === '<') {
        return event.created_at < value;
      }
    });
  }

  static isSignedEventValid(
    event: Event,
    clientId: string,
    domain: string,
  ): string | void {
    const validateErrorMsg = EventUtils.validate(event);
    if (validateErrorMsg) {
      return validateErrorMsg;
    }

    if (event.kind !== EventKind.AUTHENTICATION) {
      return 'invalid: the kind is not 22242';
    }

    let challenge = '',
      relay = '';
    event.tags.forEach(([tagName, tagValue]) => {
      if (tagName === TagName.CHALLENGE) {
        challenge = tagValue;
      } else if (tagName === TagName.RELAY) {
        relay = tagValue;
      }
    });

    if (challenge !== clientId) {
      return 'invalid: the challenge string is wrong';
    }

    try {
      if (new URL(relay).hostname !== domain) {
        return 'invalid: the relay url is wrong';
      }
    } catch {
      return 'invalid: the relay url is wrong';
    }

    if (Math.abs(event.created_at - getTimestampInSeconds()) > 10 * 60) {
      return 'invalid: the created_at should be within 10 minutes';
    }
  }

  static extractExpirationTimestamp(event: Event): number | null {
    const expirationTag = event.tags.find(
      ([tagName]) => tagName === TagName.EXPIRATION,
    );
    if (!expirationTag) {
      return null;
    }

    const expirationTimestamp = parseInt(expirationTag[1]);
    return isNaN(expirationTimestamp) ? null : expirationTimestamp;
  }

  static extractDelegationTag(event: Event): Tag | undefined {
    return event.tags.find(([tagName]) => tagName === TagName.DELEGATION);
  }

  static extractDTagValue(event: Event) {
    const type = EventUtils.getType(event);
    if (type === EventType.REPLACEABLE) return '';
    if (type !== EventType.PARAMETERIZED_REPLACEABLE) return null;

    const [, dTagValue] = event.tags.find(
      ([tagName, tagValue]) => tagName === TagName.D && !!tagValue,
    ) ?? [TagName.D, ''];

    return dTagValue;
  }

  static getAuthor(event: Event, needValidateDelegationEvent = true): string {
    if (
      needValidateDelegationEvent &&
      !EventUtils.isDelegationEventValid(event)
    ) {
      return event.pubkey;
    }

    const delegationTag = EventUtils.extractDelegationTag(event);
    return delegationTag ? delegationTag[1] : event.pubkey;
  }

  static isMatchingFilter(event: Event, filter: Filter): boolean {
    if (filter.ids && !filter.ids.some(id => id === event.id)) {
      return false;
    }

    if (
      filter.authors &&
      !filter.authors.some(author => author === EventUtils.getAuthor(event))
    ) {
      return false;
    }

    if (filter.kinds && !filter.kinds.includes(event.kind)) {
      return false;
    }

    if (filter.since && event.created_at < filter.since) {
      return false;
    }

    if (filter.until && event.created_at > filter.until) {
      return false;
    }

    // TODO: NIP-50

    return true;
  }

  static checkPermission(event: Event, pubkey?: string) {
    if (event.kind !== EventKind.ENCRYPTED_DIRECT_MESSAGE) {
      return true;
    }

    if (!pubkey) {
      return false;
    }

    const author = EventUtils.getAuthor(event, false);
    if (author === pubkey) {
      return true;
    }

    const pubkeyTag = event.tags.find(
      ([tagName]) => tagName === TagName.PUBKEY,
    );
    return pubkeyTag ? pubkey === pubkeyTag[1] : false;
  }
}
