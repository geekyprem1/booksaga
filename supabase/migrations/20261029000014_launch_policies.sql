-- Owner-provided support address and 30-day refund window. Preserve existing policy edits.
update public.app_settings
set value = value || '{"support_email":"softwarevh@gmail.com"}'::jsonb
where key = 'app';

insert into public.app_settings (key, value) values
('legal_terms', jsonb_build_object('content', $terms$
Last updated: 29 October 2026

## Using BookSaga
BookSaga helps you create, edit and export books and related publishing assets. Use the service lawfully and keep your account credentials private. Features, credits and account limits depend on the plans assigned to your account. Credits are one-time grants; they do not automatically refill each month.

## Your material and publishing responsibilities
You retain your rights in material you provide. You give BookSaga permission to process and store that material to provide the features you request. Only upload material you are entitled to use, including artwork, personal information and text. Review generated work for accuracy, originality, permissions and suitability before publishing or distributing it.

AI output may be inaccurate, resemble other work or require substantial editing. BookSaga does not guarantee exclusive rights, copyright protection, acceptance by a publishing platform, sales or income. Commercial use remains subject to your plan, third-party rights and the rules of the destination platform. BookSaga is not affiliated with Amazon or Kindle Direct Publishing.

## Accounts and service limits
Do not use the service for unlawful content, account abuse, security attacks or attempts to bypass plan and credit limits. Access may be suspended to address abuse or security concerns. Availability can be affected by maintenance and third-party providers. Keep your own copies of important manuscripts and downloaded files. Export download links expire; you can create a fresh export while you have access to the feature.

## Purchases and refunds
Our [Refund Policy](/legal/refund) provides a 30-day refund window. Refunding a plan removes the access and credit grants associated with that purchase. Other active plans are handled separately.

## Privacy and updates
See our [Privacy Policy](/legal/privacy) and [AI Content Disclosure](/legal/ai-disclosure). We may update these terms as the service changes and will show the latest update date here. Nothing here removes rights that applicable law does not allow us to exclude.

## Contact
For account, purchase or service questions, email [softwarevh@gmail.com](mailto:softwarevh@gmail.com).
$terms$)),
('legal_privacy', jsonb_build_object('content', $privacy$
Last updated: 29 October 2026

## Information we process
BookSaga processes your account name, email address, authentication information, assigned plans, purchase references and credit transactions. It also stores the ideas, manuscripts, series notes, images, audio and exports you create or upload. Service records include generation jobs, usage and cost records, activity timestamps and administrative audit logs. Support messages contain the information you choose to email us. Payment details are handled by the checkout provider used for your purchase; do not send card numbers or passwords to support.

## How information is used
We use this information to authenticate accounts, provide generation and publishing tools, manage plans and credits, handle support and refunds, investigate failures and protect the service. Necessary cookies maintain your login session. An administrator's temporary read-only preview uses a separate session cookie and is recorded in the audit log.

## Service providers and access
Hosting and database providers process information needed to run the service. BookSaga uses Supabase for account and application data. When you request AI generation, relevant prompts and source material are sent to the configured text, image or speech provider, which may include OpenRouter and Replicate. Provider handling of that information is also subject to their policies. Do not submit confidential or sensitive personal information that you are not authorized to share. Authorized support administrators can access account and project information when operating or supporting the service. If you use an agency account, your agency owner can view your series and administer your access and credit allotment.

## Storage and retention
We retain account and project information while needed to operate your account, provide requested services and maintain purchase, security and audit records. Expired export files are cleaned up separately from your manuscripts. Deleted series remain in the trash for a restoration period before scheduled deletion. Backup copies and records needed for security or legal obligations may remain for longer. Data may be processed in the locations used by our hosting and AI providers.

## Your requests
You can edit profile information and export your work from the app. To request access, correction, account deletion or information about retained records, email [softwarevh@gmail.com](mailto:softwarevh@gmail.com) from your account address. We may verify your identity before acting on a request. The options available depend on the request and applicable requirements.

## Contact and updates
For privacy questions, contact [softwarevh@gmail.com](mailto:softwarevh@gmail.com). We will update this page when our practices change.
$privacy$)),
('legal_refund', jsonb_build_object('content', $refund$
Last updated: 29 October 2026

## 30-day refund policy
You may request a refund for a BookSaga purchase within **30 calendar days of the purchase date**.

## How to request a refund
Email [softwarevh@gmail.com](mailto:softwarevh@gmail.com) within the 30-day window. Include the email address used for the purchase, your order or transaction ID, the purchase date and the product or plan purchased. A brief description of the issue can help us assist you. Do not send passwords or payment-card details.

If you purchased through a third-party checkout, use its order details so the refund can be matched and processed through the correct payment provider. Payment-provider processing and bank posting times can vary.

## What happens to access
A refund removes access and the credit grant associated with the refunded purchase. Any other active purchases are treated separately. Download copies of work you want to keep before requesting removal of account access.

## Questions
Contact [softwarevh@gmail.com](mailto:softwarevh@gmail.com) for help finding your purchase or checking a refund request. This policy does not reduce any additional rights you may have under applicable law.
$refund$)),
('legal_ai-disclosure', jsonb_build_object('content', $ai$
Last updated: 29 October 2026

## How BookSaga uses AI
BookSaga uses AI to help generate ideas, outlines, chapter text, summaries, metadata, cover artwork and synthetic narration. Requests can include your instructions and relevant project material. The configured providers may include OpenRouter, Replicate and other text-model providers selected by the service operator.

## Review before use
Generated material can contain factual mistakes, inconsistencies, unsuitable content or similarities to existing material. Review and edit all outputs, check claims and permissions, and make sure your final work is appropriate for its audience. BookSaga does not guarantee originality, copyright protection, publishing approval or commercial results.

## Publishing disclosures
Follow the current rules of the platform where you publish. Amazon KDP requires disclosure to KDP of AI-generated text, images and translations when publishing or republishing; its [Content Guidelines](https://kdp.amazon.com/en_US/help/topic/G200672390) explain the distinction between AI-generated and AI-assisted material. A disclosure inside a manuscript does not replace the platform's submission requirements. Other publishers and audiobook platforms have their own rules.

## Your responsibility and contact
You are responsible for the final material and for having the rights needed to upload, use and distribute it. See our [Privacy Policy](/legal/privacy) for information about provider processing. Questions can be sent to [softwarevh@gmail.com](mailto:softwarevh@gmail.com).
$ai$))
on conflict (key) do nothing;

notify pgrst, 'reload schema';
