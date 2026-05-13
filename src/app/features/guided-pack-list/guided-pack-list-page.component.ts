import { Component, inject } from '@angular/core';
import { NgFor } from '@angular/common';
import { Router } from '@angular/router';
import { allDiagnosticPacks } from '../../core/diagnostics/packs';
import type { KnowledgePack } from '../../core/diagnostics/diagnostic-types';

@Component({
  selector: 'app-guided-pack-list-page',
  standalone: true,
  imports: [NgFor],
  templateUrl: './guided-pack-list-page.component.html',
  styleUrls: ['./guided-pack-list-page.component.scss'],
})
export class GuidedPackListPageComponent {
  private router = inject(Router);

  readonly packs: readonly KnowledgePack[] = allDiagnosticPacks;

  openPack(pack: KnowledgePack): void {
    this.router.navigate(['/ai-diagnosis-assistant/guided', pack.id.replace(/_/g, '-')]);
  }

  goBack(): void {
    this.router.navigate(['/diagnosis-assistant']);
  }
}
