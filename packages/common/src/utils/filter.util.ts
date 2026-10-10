import { EventKind } from '../constants';
import { Filter } from '../interfaces';

export class FilterUtils {
  /** Keep empty OR sets (match nothing); remove empty AND sets (no requirement). */
  static normalize(filter: Filter): Filter {
    const normalized: Filter = {};
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        const values = [...new Set(value)];
        if (key[0] === '&' && values.length === 0) continue;
        normalized[key] = values;
      } else if (key === 'search') {
        if (value.trim()) normalized.search = value.trim();
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  static isMatchNone(filter: Filter): boolean {
    return (
      (filter.since !== undefined &&
        filter.until !== undefined &&
        filter.since > filter.until) ||
      Object.entries(filter).some(
        ([key, value]) =>
          (['ids', 'authors', 'kinds'].includes(key) ||
            /^#[a-zA-Z]$/.test(key)) &&
          Array.isArray(value) &&
          value.length === 0,
      )
    );
  }
  static hasEncryptedDirectMessageKind(filter: Filter): boolean {
    return (
      !!filter.kinds &&
      filter.kinds.includes(EventKind.ENCRYPTED_DIRECT_MESSAGE)
    );
  }

  static canIncludeEncryptedDirectMessageKind(filter: Filter): boolean {
    return (
      filter.kinds === undefined ||
      filter.kinds.includes(EventKind.ENCRYPTED_DIRECT_MESSAGE)
    );
  }
}
