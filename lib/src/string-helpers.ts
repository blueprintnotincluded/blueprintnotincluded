export class StringHelpers {
  public static stripHtml(html: string): string {
    // TODO FIX ME
    return html;
  }

  public static createUrl(ressource: string, ui: boolean): string {
    return 'assets/images/' + (ui ? 'ui/' : '') + ressource + '.png';
  }
}
