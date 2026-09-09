declare module '@mailchimp/mailchimp_transactional' {
  interface MailchimpMessage {
    message: {
      from_email: string;
      from_name?: string;
      subject: string;
      text?: string;
      html?: string;
      to: Array<{
        email: string;
        type: 'to' | 'cc' | 'bcc';
        name?: string;
      }>;
    };
  }

  interface MailchimpClient {
    messages: {
      send(message: MailchimpMessage): Promise<Array<{
        email: string;
        status: string;
        _id: string;
        reject_reason?: string;
      }>>;
    };
  }

  function mailchimp(apiKey: string): MailchimpClient;
  export = mailchimp;
} 