import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createUser } from '../actions';
import { staffFormOptions } from '../options';
import { UserForm } from '../user-form';

export default async function NewUserPage() {
  const viewer = await requirePermission('users.manage');
  const locale = await getAdminLocale(viewer.language as 'ru' | 'en' | 'uz');
  const options = await staffFormOptions(locale);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={translate(locale, 'users.add')}
        backHref="/admin/users"
        backLabel={translate(locale, 'common.back')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{translate(locale, 'users.name')}</CardTitle>
          <CardDescription>{translate(locale, 'users.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm
            action={createUser}
            roles={options.roles}
            languages={options.languages}
            statuses={options.statuses}
            labels={options.labels}
            showStatus={false}
            values={{ displayName: '', email: '', username: '', roleId: options.roles[0]?.id ?? '', language: locale, status: 'invited' }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
