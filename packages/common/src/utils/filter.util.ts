import { EventKind } from '../enums';
import { Filter } from '../interfaces';

export class FilterUtils {
  static hasEncryptedDirectMessageKind(filter: Filter): boolean {
    return (
      !!filter.kinds &&
      filter.kinds.includes(EventKind.ENCRYPTED_DIRECT_MESSAGE)
    );
  }
}
