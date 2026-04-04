import { Component, OnInit, ViewChild, ChangeDetectorRef } from "@angular/core";
import { Dialog } from "primeng/dialog";
import { LoginFormComponent } from "../login-form/login-form.component";
import { RegisterFormComponent } from "../register-form/register-form.component";

@Component({
  selector: "app-login-dialog",
  templateUrl: "./login-dialog.component.html",
  styleUrls: ["./login-dialog.component.css"],
  standalone: false,
})
export class ComponentLoginDialogComponent implements OnInit {
  visible: boolean = false;
  loginType: LoginType = LoginType.Login;

  @ViewChild("loginDialog", { static: true }) loginDialog!: Dialog;
  @ViewChild("loginForm") loginForm!: LoginFormComponent;
  @ViewChild("registerForm") registerForm!: RegisterFormComponent;

  get label() {
    return this.isLogin ? $localize`Login` : $localize`Register`;
  } //!loginForm.valid || loginForm.pending || working
  get icon() {
    if (this.isLogin && this.loginForm != null)
      return this.loginForm.working ? "pi pi-spin pi-spinner" : "";
    else if (this.isRegistration && this.registerForm != null)
      return this.registerForm.working ? "pi pi-spin pi-spinner" : "";
    else return "";
  }
  get disabled() {
    if (this.isLogin && this.loginForm != null)
      return (
        !this.loginForm.loginForm.valid ||
        this.loginForm.loginForm.pending ||
        this.loginForm.working
      );
    else if (this.isRegistration && this.registerForm != null)
      return (
        !this.registerForm.registerForm.valid ||
        this.registerForm.registerForm.pending ||
        this.registerForm.working
      );
    else return false;
  }

  constructor(private cdRef: ChangeDetectorRef) {}

  ngOnInit() {
    // This is here because we have getters with static=false ViewChild
    this.cdRef.detectChanges();
  }

  cancel(_event: any) {
    this.hideDialog();
  }

  showDialog() {
    this.loginType = LoginType.Login;
    this.cdRef.detectChanges();

    this.loginForm.reset();
    this.visible = true;
    this.recenter();
  }

  submit() {
    if (this.isLogin) this.loginForm.onSubmit();
    else if (this.isRegistration) this.registerForm.onSubmit();
  }

  hideDialog() {
    this.visible = false;
  }

  get isLogin(): boolean {
    return this.loginType == LoginType.Login;
  }
  get isRegistration(): boolean {
    return this.loginType == LoginType.Registration;
  }

  registration() {
    this.loginType = LoginType.Registration;
    this.cdRef.detectChanges();

    this.registerForm.reset();
    this.recenter();
  }

  recenter() {
    //setTimeout(() => {this.loginDialog.positionOverlay();}, 0)
  }
}

enum LoginType {
  Login,
  Registration,
  ForgotPassword,
}
