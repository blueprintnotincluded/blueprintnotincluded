import { deepMap } from './utility';

// More info on Open Graph meta tags at https://ogp.me/
export interface OpenGraphMeta {
  // The title of your object as it should appear within the graph, e.g., "The Rock".
  'og:title': string;
  // The type of your object, e.g., "video.movie". Depending on the type you specify, other properties may also be required.
  'og:type': string;
  // The canonical URL of your object that will be used as its permanent ID in the graph, e.g., "https://www.imdb.com/title/tt0117500/".
  'og:url': string;
  // A one to two sentence description of your object.
  'og:description'?: string;
  // If your object is part of a larger web site, the name which should be displayed for the overall site. e.g., "IMDb".
  'og:site_name'?: string;
  images?: OpenGraphImage[];
}

export interface OpenGraphImage {
  // An image URL which should represent your object within the graph.
  'og:image:url': string;
  // The same URL, included in diplicate for broken bots
  'og:image': string;
  // A description of what is in the image (not a caption).
  'og:image:alt'?: string;
  // A MIME type for this image.
  'og:image:type'?: string;
  // The number of pixels wide.
  'og:image:width'?: string;
  // The number of pixels high.
  'og:image:height'?: string;
}

type OpenGraphTags = keyof Omit<OpenGraphMeta, 'images'> | keyof OpenGraphImage;

export const defaultImageSquare: OpenGraphImage = {
  'og:image': '/images/site-preview-large-square.png',
  'og:image:url': '/images/site-preview-large-square.png',
  'og:image:type': 'image/png',
  'og:image:height': '1200',
  'og:image:width': '1200',
  'og:image:alt': 'An example blueprint, shown against the website editor.',
};

export const defaultImageWide: OpenGraphImage = {
  'og:image': '/images/site-preview-large-wide.png',
  'og:image:url': '/images/site-preview-large-wide.png',
  'og:image:type': 'image/png',
  'og:image:height': '671',
  'og:image:width': '1200',
  'og:image:alt':
    'An example blueprint, shown against the website editor, next to the blueprint not included logo.',
};

export const defaultWebsiteMeta: OpenGraphMeta = {
  'og:type': 'website',
  'og:url': process.env.HOST || 'https://example.com',
  'og:title': 'Blueprint Not Included',
  'og:description':
    'A place to upload, build, and share your favourite blueprint designs for Oxygen Not Included.',
  images: [defaultImageSquare, defaultImageWide],
};

export const htmlMetaTag = (property: OpenGraphTags, content: string) =>
  `<meta property="${property}" content="${content}" />`;

export class WebsiteMeta {
  public meta: OpenGraphMeta;

  constructor(meta: Partial<OpenGraphMeta> = {}) {
    this.meta = { ...defaultWebsiteMeta, ...meta };
  }

  public getHtmlTags() {
    return deepMap(this.meta, htmlMetaTag).join('');
  }
}
