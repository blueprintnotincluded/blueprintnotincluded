import { Component } from "@angular/core";

@Component({
  selector: "admin-access-denied",
  template: `
    <div
      style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif"
    >
      <h1>Access Denied</h1>
      <p>
        You need to be logged in as an admin. Please
        <a href="http://localhost:4200" target="_self"
          >log in at the main site</a
        >
        first, then come back with your token.
      </p>
      <p style="font-size:0.85em; color:#888">
        Dev tip: run this in the main app's console and paste the URL in a new
        tab:<br /><code
          >console.log('http://localhost:4201/?token=' +
          localStorage.getItem('blueprintnotincluded-token'))</code
        >
      </p>
    </div>
  `,
  standalone: false,
})
export class AccessDeniedComponent {}
