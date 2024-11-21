import { Event } from '@nostr-relay/common';

const SEARCHABLE_TAGS = ['title', 'description', 'about', 'summary', 'alt'];
const SEARCHABLE_KIND_WHITELIST = [0, 1, 1111, 9802, 30023, 30024];
const SEARCHABLE_CONTENT_FORMATTERS: Record<
  number,
  (content: string) => string
> = {
  [0]: content => {
    const SEARCHABLE_PROFILE_FIELDS = [
      'name',
      'display_name',
      'about',
      'nip05',
      'lud16',
      'website',
      // Deprecated fields
      'displayName',
      'username',
    ];
    try {
      const lines: string[] = [];
      const json = JSON.parse(content);

      for (const field of SEARCHABLE_PROFILE_FIELDS) {
        if (json[field]) lines.push(json[field]);
      }

      return lines.join('\n');
    } catch {
      return content;
    }
  },
};

export function extractSearchableContent(event: Event): string {
  if (!SEARCHABLE_KIND_WHITELIST.includes(event.kind)) return '';

  const formattedContent = (
    SEARCHABLE_CONTENT_FORMATTERS[event.kind]
      ? SEARCHABLE_CONTENT_FORMATTERS[event.kind](event.content)
      : event.content
  ).trim();

  const formattedTags = event.tags
    .filter(([tagName]) => SEARCHABLE_TAGS.includes(tagName))
    .map(([, tagValue]) => tagValue.trim())
    .filter(Boolean)
    .join(' ');

  return cleanContent(`${formattedContent} ${formattedTags}`);
}

function cleanContent(content: string): string {
  // remove all image and video links
  content = content.replace(
    /https?:\/\/\S+\.(jpg|jpeg|png|gif|bmp|webp|tiff|tif|svg|ico|heic|mp4|mkv|mov|avi|flv|wmv|webm|m4v|3gp|ts)(\?\S*)?/gi,
    '',
  );

  // remove all nostr:...
  content = content.replace(/nostr:\S+/g, '');

  // remove extra spaces
  content = content.replace(/\s+/g, ' ').trim();

  return content;
}
