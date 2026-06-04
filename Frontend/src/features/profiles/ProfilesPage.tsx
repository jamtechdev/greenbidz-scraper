import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCode2, Play, Plus, CheckCircle2, Images, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ErrorState, TableSkeleton, EmptyState } from '@/components/ui/states';
import { useProfiles, useRunProfile } from '@/hooks/useApi';
import type { ProfileListItem } from '@/types/api';
import { timeAgo } from '@/lib/format';

export function ProfilesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useProfiles();
  const profiles = data?.profiles ?? [];

  return (
    <>
      <PageHeader
        title="Profiles"
        description="Saved scraping profiles. Run one to scrape new products on demand."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/scraper/new')}>
            New scraper
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : isError ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : !profiles.length ? (
            <EmptyState
              title="No profiles yet"
              hint="Build one in the visual Mapping Studio."
              icon={<FileCode2 className="h-5 w-5" />}
            />
          ) : (
            <Table>
              <THead>
                <TH>Profile</TH>
                <TH>Source</TH>
                <TH>Mode</TH>
                <TH>Mapping</TH>
                <TH>Updated</TH>
                <TH className="text-right">Actions</TH>
              </THead>
              <TBody>
                {profiles.map((p) => (
                  <ProfileRow key={p.fileName} profile={p} />
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function ProfileRow({ profile: p }: { profile: ProfileListItem }) {
  const run = useRunProfile();
  const [done, setDone] = useState(false);
  const canRun = p.listingUrls.length > 0;

  const onRun = () => {
    run.mutate(p.fileName, {
      onSuccess: () => {
        setDone(true);
        setTimeout(() => setDone(false), 4000);
      },
    });
  };

  return (
    <TR>
      <TD className="max-w-[320px]">
        <div className="font-medium text-ink">{p.profileName || p.fileName}</div>
        <div className="truncate text-xs text-muted">{p.domain || p.fileName}</div>
      </TD>
      <TD>
        <Badge tone={p.source === 'api' ? 'api' : 'dom'}>{p.source}</Badge>
      </TD>
      <TD>
        <div className="flex items-center gap-1.5">
          {p.scrapeMode === 'auto' ? (
            <Badge tone="yes">with job</Badge>
          ) : p.scrapeMode === 'manual' ? (
            <Badge tone="neutral">one-time</Badge>
          ) : (
            <Badge tone="warn">unset</Badge>
          )}
          <Badge tone="info">{p.scrapeLimit ? `≤${p.scrapeLimit}/run` : 'all/run'}</Badge>
        </div>
      </TD>
      <TD>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{p.fieldCount} fields</span>
          {p.hasImages && (
            <span className="flex items-center gap-1">
              <Images className="h-3 w-3" /> images
            </span>
          )}
        </div>
      </TD>
      <TD className="whitespace-nowrap text-xs text-muted">{timeAgo(p.updatedAt)}</TD>
      <TD>
        <div className="flex items-center justify-end gap-2">
          {run.isError && (
            <span className="flex items-center gap-1 text-xs text-danger" title={(run.error as Error).message}>
              <AlertCircle className="h-3.5 w-3.5" /> failed
            </span>
          )}
          {done ? (
            <span className="flex items-center gap-1 text-xs text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" /> started
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<Play className="h-3.5 w-3.5" />}
              loading={run.isPending}
              disabled={!canRun}
              onClick={onRun}
              title={canRun ? 'Crawl this profile now' : 'No listing URLs on this profile'}
            >
              Scrape new
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}
