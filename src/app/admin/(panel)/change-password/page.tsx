import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { ChangePasswordForm } from './change-password-form';

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');

  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader
        title={translate(locale, 'pwd.title')}
        description={translate(locale, 'pwd.hint')}
        backHref="/admin"
        backLabel={translate(locale, 'common.back')}
      />

      <ChangePasswordForm
        mustChange={user.mustChangePassword}
        labels={{
          current: translate(locale, 'pwd.current'),
          next: translate(locale, 'pwd.next'),
          confirm: translate(locale, 'pwd.confirm'),
          hint: translate(locale, 'pwd.hint'),
          note: translate(locale, 'pwd.note'),
          save: translate(locale, 'pwd.save'),
          cancel: translate(locale, 'common.cancel'),
          required: translate(locale, 'pwd.required'),
          requiredBody: translate(locale, 'pwd.requiredBody'),
        }}
      />
    </div>
  );
}
