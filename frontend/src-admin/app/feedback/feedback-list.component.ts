import { Component, OnInit } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { AdminAuthService } from "../auth.service";

export type FeedbackStatus = "open" | "resolved" | "spam";

export interface FeedbackItem {
  _id: string;
  userId: string;
  userEmail: string;
  username: string;
  message: string;
  url: string;
  userAgent: string;
  consoleErrors: string[];
  status: FeedbackStatus;
  createdAt: string;
}

interface FeedbackPage {
  items: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
}

@Component({
  selector: "admin-feedback-list",
  templateUrl: "./feedback-list.component.html",
  standalone: false,
})
export class FeedbackListComponent implements OnInit {
  items: FeedbackItem[] = [];
  total = 0;
  page = 1;
  readonly limit = 50;

  statusFilter: FeedbackStatus | "" = "open";
  loading = false;

  selectedItem: FeedbackItem | null = null;
  detailVisible = false;

  readonly statusOptions = [
    { label: "All", value: "" },
    { label: "Open", value: "open" },
    { label: "Resolved", value: "resolved" },
    { label: "Spam", value: "spam" },
  ];

  constructor(private http: HttpClient, private auth: AdminAuthService) {}

  ngOnInit() {
    this.load();
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  load() {
    this.loading = true;
    const params: Record<string, string> = { page: String(this.page) };
    if (this.statusFilter) params["status"] = this.statusFilter;

    this.http
      .get<FeedbackPage>("/api/admin/feedback", {
        headers: this.headers(),
        params,
      })
      .subscribe({
        next: (data) => {
          this.items = data.items;
          this.total = data.total;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onFilterChange() {
    this.page = 1;
    this.load();
  }

  openDetail(item: FeedbackItem) {
    this.selectedItem = item;
    this.detailVisible = true;
  }

  setStatus(item: FeedbackItem, status: FeedbackStatus) {
    this.http
      .patch<FeedbackItem>(
        `/api/admin/feedback/${item._id}`,
        { status },
        { headers: this.headers() }
      )
      .subscribe({
        next: (updated) => {
          const idx = this.items.findIndex((i) => i._id === updated._id);
          if (idx !== -1) this.items[idx] = updated;
          if (this.selectedItem?._id === updated._id)
            this.selectedItem = updated;
        },
      });
  }
}
