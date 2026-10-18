/** Keep typed text separate from the last place whose coordinates were validated. */
export class DiscoveryPlaceInput {
  private revision = 0;
  private draft = '';
  private validated = '';

  get needsSelection(): boolean {
    return this.draft.length > 0 && this.draft !== this.validated;
  }

  input(value: string): void {
    const next = value.trim();
    if (next !== this.draft) {
      this.draft = next;
      this.revision += 1;
    }
  }

  beginSelection(value: string): number {
    this.input(value);
    return ++this.revision;
  }

  invalidate(): void {
    this.revision += 1;
  }

  isCurrent(revision: number, value: string): boolean {
    return revision === this.revision && value.trim() === this.draft;
  }

  validate(revision: number, value: string): boolean {
    if (!this.isCurrent(revision, value)) return false;
    this.validated = this.draft;
    return true;
  }
}
