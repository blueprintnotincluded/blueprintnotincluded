import { Component } from "@angular/core";

@Component({
  selector: "admin-root",
  template: `
    <nav class="admin-navbar">
      <a href="/" class="admin-navbar-brand">
        <img src="/assets/favicon-32x32.png" alt="" width="24" height="24" />
        <span>Blueprint Not Included</span>
      </a>
      <span class="admin-navbar-label">Admin</span>
    </nav>
    <router-outlet></router-outlet>
  `,
  styles: [
    `
      .admin-navbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 1.25rem;
        height: 48px;
        background: var(--p-primary-600);
        color: #fff;
      }
      .admin-navbar-brand {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #fff;
        text-decoration: none;
        font-weight: 600;
        font-size: 0.95rem;
      }
      .admin-navbar-brand:hover {
        opacity: 0.85;
      }
      .admin-navbar-label {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        opacity: 0.75;
      }
    `,
  ],
  standalone: false,
})
export class AdminRootComponent {}
