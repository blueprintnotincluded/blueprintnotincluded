import { AppModule } from "./app.module";

describe("AppModule", () => {
  it("should create an instance", () => {
    const appModule = new AppModule({} as any);
    expect(appModule).toBeTruthy();
  });
});
