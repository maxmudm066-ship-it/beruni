/**
 * Content type registry — the backbone of the CMS.
 *
 * One generic editor, one generic list view and one generic workflow engine are driven by
 * these descriptors, so adding a content type is a data change rather than a new page.
 * Field names map to ContentItem columns or to the type's detail table (see prisma/schema.prisma).
 */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'checkbox'
  | 'select'
  | 'tags'
  | 'category'
  | 'media'
  | 'mediaGallery'
  | 'mediaList'
  | 'authors'
  | 'people'
  | 'contentRef'
  | 'url'
  | 'json';

export interface FieldDef {
  /** Path inside the detail table, or a reserved core key (title, slug, excerpt, body, ...). */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  hint?: string;
  /** Which admin help text to show under the field. */
  help?: string;
  options?: { value: string; label: string }[];
  /** For 'contentRef': the content type key being referenced. */
  target?: string;
  /** For 'contentRef': allow picking several referenced materials. */
  many?: boolean;
  /** Group fields together in the editor. */
  section?: 'main' | 'taxonomy' | 'media' | 'relations' | 'meta' | 'seo';
  scope?: string;
  rows?: number;
}

export interface ContentTypeDef {
  key: string;
  label: string;
  /** Prisma detail model name, when the type has one. */
  detailModel?: string;
  /** Sidebar order inside the admin panel. */
  navOrder: number;
  navGroup: 'content' | 'science' | 'structure' | 'media' | 'system';
  /** Spec requires Preview for exactly these types. */
  hasPreview: boolean;
  /** Types that go through Draft → In Review → Approved → Published. */
  needsReview: boolean;
  /** Category scope key used to filter the Category picker. */
  categoryScope?: string;
  fields: FieldDef[];
}

const CORE_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true, section: 'main' },
  { name: 'subtitle', label: 'Subtitle', kind: 'text', section: 'main' },
  { name: 'slug', label: 'Slug', kind: 'text', section: 'main', hint: 'Use Latin letters and hyphens. Changing it creates a redirect automatically.' },
  { name: 'lang', label: 'Language', kind: 'select', required: true, section: 'main', hint: 'Language of this version. Other languages are managed in Translations.' },
  { name: 'excerpt', label: 'Short Description', kind: 'textarea', section: 'main', rows: 3, hint: 'Shown in listings and search results. Keep it under 300 characters.' },
  { name: 'body', label: 'Content', kind: 'richtext', section: 'main', hint: 'Insert images from the Media Library, not by typing a path.' },
  { name: 'mainImage', label: 'Main Image', kind: 'media', section: 'media', hint: 'Choose from Media Library.' },
  { name: 'gallery', label: 'Gallery', kind: 'mediaGallery', section: 'media' },
  { name: 'attachments', label: 'Attachments', kind: 'mediaList', section: 'media', hint: 'PDF, DOCX, XLSX. You can replace a file later without changing its URL.' },
  { name: 'author', label: 'Author', kind: 'select', section: 'meta', hint: 'The institute staff member credited with this material.' },
  { name: 'publishedAt', label: 'Publication Date', kind: 'datetime', section: 'meta' },
  { name: 'tags', label: 'Tags', kind: 'tags', section: 'taxonomy' },
  { name: 'seoTitle', label: 'SEO Title', kind: 'text', section: 'seo', hint: 'Recommended length: 50–60 characters.' },
  { name: 'seoDescription', label: 'SEO Description', kind: 'textarea', section: 'seo', rows: 2, hint: 'Recommended length: 120–160 characters.' },
  { name: 'keywords', label: 'Keywords', kind: 'text', section: 'seo' },
  { name: 'canonicalUrl', label: 'Canonical URL', kind: 'url', section: 'seo' },
  { name: 'ogTitle', label: 'OG Title', kind: 'text', section: 'seo' },
  { name: 'ogDescription', label: 'OG Description', kind: 'textarea', section: 'seo', rows: 2 },
  { name: 'ogImage', label: 'OG Image', kind: 'media', section: 'seo' },
];

function core(...extra: FieldDef[]): FieldDef[] {
  return [...extra, ...CORE_FIELDS];
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export const CONTENT_TYPES: ContentTypeDef[] = [
  {
    key: 'news',
    label: 'News',
    detailModel: 'news',
    navOrder: 10,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'news',
    fields: core(
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'news', section: 'taxonomy' },
      { name: 'isFeatured', label: 'Featured', kind: 'checkbox', section: 'meta' },
    ),
  },
  {
    key: 'article',
    label: 'Articles',
    detailModel: 'article',
    navOrder: 20,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'article',
    fields: core(
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'article', section: 'taxonomy' },
      { name: 'journalId', label: 'Journal', kind: 'contentRef', target: 'journal', section: 'relations' },
      { name: 'doi', label: 'DOI', kind: 'text', section: 'meta' },
      { name: 'references', label: 'References', kind: 'textarea', rows: 6, section: 'main', hint: 'One reference per line.' },
    ),
  },
  {
    key: 'book',
    label: 'Books',
    detailModel: 'book',
    navOrder: 30,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'book',
    fields: core(
      { name: 'authors', label: 'Authors', kind: 'authors', section: 'relations' },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'book', section: 'taxonomy' },
      { name: 'isbn', label: 'ISBN', kind: 'text', section: 'meta' },
      { name: 'publisher', label: 'Publisher', kind: 'text', section: 'main' },
      { name: 'place', label: 'Place of Publication', kind: 'text', section: 'main' },
      { name: 'year', label: 'Year', kind: 'number', section: 'meta' },
      { name: 'pages', label: 'Pages', kind: 'number', section: 'main' },
      { name: 'edition', label: 'Edition', kind: 'text', section: 'main' },
      { name: 'cover', label: 'Cover', kind: 'media', section: 'media' },
      { name: 'fullText', label: 'Book PDF', kind: 'mediaList', section: 'media' },
    ),
  },
  {
    key: 'publication',
    label: 'Publications',
    detailModel: 'publication',
    navOrder: 40,
    navGroup: 'science',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'publication',
    fields: core(
      { name: 'authors', label: 'Authors', kind: 'authors', section: 'relations' },
      { name: 'kind', label: 'Type', kind: 'select', section: 'main', options: [
        { value: 'book', label: 'Book' },
        { value: 'article', label: 'Article' },
        { value: 'journal', label: 'Scientific journal' },
        { value: 'proceedings', label: 'Conference proceedings' },
        { value: 'dissertation', label: 'Dissertation' },
        { value: 'report', label: 'Report' },
        { value: 'other', label: 'Other publication' },
      ] },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'publication', section: 'taxonomy' },
      { name: 'journalId', label: 'Journal', kind: 'contentRef', target: 'journal', section: 'relations' },
      { name: 'isbn', label: 'ISBN', kind: 'text', section: 'meta' },
      { name: 'doi', label: 'DOI', kind: 'text', section: 'meta' },
      { name: 'publisher', label: 'Publisher', kind: 'text', section: 'main' },
      { name: 'year', label: 'Year', kind: 'number', section: 'meta' },
      { name: 'volume', label: 'Volume', kind: 'text', section: 'main' },
      { name: 'issue', label: 'Issue', kind: 'text', section: 'main' },
      { name: 'pages', label: 'Pages', kind: 'text', section: 'main' },
    ),
  },
  {
    key: 'manuscript',
    label: 'Manuscripts',
    detailModel: 'manuscript',
    navOrder: 50,
    navGroup: 'science',
    hasPreview: true,
    needsReview: false,
    categoryScope: 'manuscript',
    fields: core(
      { name: 'titleOriginal', label: 'Manuscript Title (original)', kind: 'text', section: 'main' },
      { name: 'authorOriginal', label: 'Author (original)', kind: 'text', section: 'main' },
      { name: 'repositoryId', label: 'Repository ID', kind: 'text', section: 'main', hint: 'Signature or inventory number used by the manuscript fund.' },
      { name: 'invNo', label: 'Inventory No.', kind: 'text', section: 'main' },
      { name: 'languageOfText', label: 'Language of Text', kind: 'text', section: 'main', hint: 'Language the manuscript is written in, not the catalogue language.' },
      { name: 'script', label: 'Script', kind: 'text', section: 'main' },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'manuscript', section: 'taxonomy' },
      { name: 'subject', label: 'Subject', kind: 'text', section: 'taxonomy' },
      { name: 'periodLabel', label: 'Period', kind: 'text', section: 'main' },
      { name: 'century', label: 'Century', kind: 'number', section: 'main' },
      { name: 'dateHijri', label: 'Date (Hijri)', kind: 'text', section: 'main' },
      { name: 'dateGregorian', label: 'Date (Gregorian)', kind: 'text', section: 'main' },
      { name: 'folios', label: 'Folios', kind: 'text', section: 'main' },
      { name: 'dimensions', label: 'Dimensions', kind: 'text', section: 'main' },
      { name: 'material', label: 'Material', kind: 'text', section: 'main' },
      { name: 'colophon', label: 'Colophon', kind: 'textarea', rows: 4, section: 'main' },
      { name: 'incipit', label: 'Incipit', kind: 'textarea', rows: 3, section: 'main' },
      { name: 'explicit', label: 'Explicit', kind: 'textarea', rows: 3, section: 'main' },
      { name: 'bibliographicInfo', label: 'Bibliographic Information', kind: 'textarea', rows: 5, section: 'main' },
      { name: 'digitalCopyNote', label: 'Digital Copy Information', kind: 'textarea', rows: 3, section: 'main' },
      { name: 'hasDigitalCopy', label: 'Digital Copy Available', kind: 'checkbox', section: 'meta' },
      { name: 'digitalFiles', label: 'Digital Files', kind: 'mediaList', section: 'media' },
    ),
  },
  {
    key: 'dissertation',
    label: 'Dissertations',
    detailModel: 'dissertation',
    navOrder: 60,
    navGroup: 'science',
    hasPreview: false,
    needsReview: true,
    fields: core(
      { name: 'degree', label: 'Degree', kind: 'select', required: true, section: 'main', options: [
        { value: 'phd', label: 'PhD' },
        { value: 'dsc', label: 'DSc' },
      ] },
      { name: 'candidateName', label: 'Candidate', kind: 'text', required: true, section: 'main' },
      { name: 'specialtyCode', label: 'Specialty Code', kind: 'text', section: 'main' },
      { name: 'specialty', label: 'Specialty', kind: 'text', section: 'main' },
      { name: 'supervisor', label: 'Scientific Supervisor', kind: 'text', section: 'main' },
      { name: 'organization', label: 'Organization', kind: 'text', section: 'main' },
      { name: 'defenseDate', label: 'Defense Date', kind: 'date', section: 'meta' },
      { name: 'defenseTime', label: 'Defense Time', kind: 'time', section: 'meta' },
      { name: 'defensePlace', label: 'Defense Place', kind: 'text', section: 'main' },
      { name: 'councilCode', label: 'Council Code', kind: 'text', section: 'main' },
      { name: 'stage', label: 'Status', kind: 'select', section: 'meta', options: [
        { value: 'announced', label: 'Announced' },
        { value: 'defended', label: 'Defended' },
        { value: 'awarded', label: 'Awarded' },
        { value: 'withdrawn', label: 'Withdrawn' },
      ] },
      { name: 'abstract', label: 'Abstract', kind: 'richtext', section: 'main' },
      { name: 'documents', label: 'Documents', kind: 'mediaList', section: 'media', hint: 'Author abstract, full text, protocol, reviews.' },
    ),
  },
  {
    key: 'event',
    label: 'Events',
    detailModel: 'event',
    navOrder: 70,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'event',
    fields: core(
      { name: 'kind', label: 'Event Type', kind: 'select', section: 'main', options: [
        { value: 'conference', label: 'Conference' },
        { value: 'seminar', label: 'Seminar' },
        { value: 'workshop', label: 'Workshop' },
        { value: 'scientific_meeting', label: 'Scientific meeting' },
        { value: 'summer_school', label: 'Summer school' },
        { value: 'public_lecture', label: 'Public lecture' },
        { value: 'international', label: 'International event' },
      ] },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'event', section: 'taxonomy' },
      { name: 'startDate', label: 'Start Date', kind: 'date', required: true, section: 'meta' },
      { name: 'endDate', label: 'End Date', kind: 'date', section: 'meta' },
      { name: 'startTime', label: 'Start Time', kind: 'time', section: 'meta' },
      { name: 'endTime', label: 'End Time', kind: 'time', section: 'meta' },
      { name: 'location', label: 'Location', kind: 'text', section: 'main' },
      { name: 'venue', label: 'Venue / Hall', kind: 'text', section: 'main' },
      { name: 'organizers', label: 'Organizer', kind: 'text', section: 'main' },
      { name: 'speakers', label: 'Speakers', kind: 'people', section: 'relations' },
      { name: 'program', label: 'Program', kind: 'richtext', section: 'main' },
      { name: 'registrationUrl', label: 'Registration Link', kind: 'url', section: 'main' },
      { name: 'contactPerson', label: 'Contact Person', kind: 'text', section: 'main' },
      { name: 'contactEmail', label: 'Contact Email', kind: 'text', section: 'main' },
      { name: 'contactPhone', label: 'Contact Phone', kind: 'text', section: 'main' },
      { name: 'isOnline', label: 'Online', kind: 'checkbox', section: 'meta' },
      { name: 'isInternational', label: 'International', kind: 'checkbox', section: 'meta' },
      { name: 'videos', label: 'Videos', kind: 'mediaList', section: 'media', hint: 'Paste a YouTube or Vimeo link, or choose an uploaded video.' },
    ),
  },
  {
    key: 'announcement',
    label: 'Announcements',
    detailModel: 'announcement',
    navOrder: 80,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    categoryScope: 'announcement',
    fields: core(
      { name: 'kind', label: 'Type', kind: 'select', section: 'main', options: [
        { value: 'scientific', label: 'Scientific announcements' },
        { value: 'dissertation', label: 'Dissertation announcements' },
        { value: 'vacancy', label: 'Vacancies' },
        { value: 'procurement', label: 'Procurement' },
        { value: 'event', label: 'Events' },
        { value: 'official', label: 'Official announcements' },
      ] },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'announcement', section: 'taxonomy' },
      { name: 'expiresAt', label: 'Valid Until', kind: 'datetime', section: 'meta', hint: 'Expired announcements are hidden from the public site automatically.' },
      { name: 'contactPerson', label: 'Contact Person', kind: 'text', section: 'main' },
      { name: 'contactEmail', label: 'Contact Email', kind: 'text', section: 'main' },
      { name: 'contactPhone', label: 'Contact Phone', kind: 'text', section: 'main' },
      { name: 'isPinned', label: 'Pin to top', kind: 'checkbox', section: 'meta' },
    ),
  },
  {
    key: 'researcher',
    label: 'Researchers',
    detailModel: 'researcher',
    navOrder: 90,
    navGroup: 'structure',
    hasPreview: true,
    needsReview: true,
    fields: core(
      { name: 'position', label: 'Position', kind: 'text', section: 'main' },
      { name: 'leadershipRole', label: 'Leadership Role', kind: 'select', section: 'main', options: [
        { value: 'director', label: 'Director' },
        { value: 'deputy_director', label: 'Deputy Director' },
        { value: 'scientific_secretary', label: 'Scientific Secretary' },
        { value: 'department_head', label: 'Department Head' },
        { value: 'none', label: 'Not leadership' },
      ], hint: 'Shown on the Leadership page.' },
      { name: 'degree', label: 'Scientific Degree', kind: 'text', section: 'main' },
      { name: 'academicTitle', label: 'Academic Title', kind: 'text', section: 'main' },
      { name: 'specialty', label: 'Specialty', kind: 'text', section: 'main' },
      { name: 'interests', label: 'Research Interests', kind: 'textarea', rows: 4, section: 'main' },
      { name: 'departmentId', label: 'Department', kind: 'contentRef', target: 'department', section: 'relations' },
      { name: 'email', label: 'Email', kind: 'text', section: 'main' },
      { name: 'phone', label: 'Phone', kind: 'text', section: 'main' },
      { name: 'orcid', label: 'ORCID', kind: 'text', section: 'meta' },
      { name: 'website', label: 'Personal Website', kind: 'url', section: 'main' },
      { name: 'links', label: 'Additional Links', kind: 'json', section: 'main', hint: 'One link per line as "Label | https://example.com".' },
      { name: 'birthYear', label: 'Birth Year', kind: 'number', section: 'main' },
      { name: 'isYoungScientist', label: 'Young Scientist', kind: 'checkbox', section: 'meta' },
      { name: 'photo', label: 'Photograph', kind: 'media', section: 'media' },
      { name: 'publications', label: 'Publications', kind: 'contentRef', target: 'publication', many: true, section: 'relations' },
    ),
  },
  {
    key: 'department',
    label: 'Departments',
    detailModel: 'department',
    navOrder: 100,
    navGroup: 'structure',
    hasPreview: false,
    needsReview: false,
    fields: core(
      { name: 'kind', label: 'Unit Type', kind: 'select', section: 'main', options: [
        { value: 'department', label: 'Department' },
        { value: 'center', label: 'Research Center' },
        { value: 'group', label: 'Research Group' },
        { value: 'council', label: 'Scientific Council' },
        { value: 'division', label: 'Division' },
        { value: 'laboratory', label: 'Laboratory' },
      ] },
      { name: 'parentId', label: 'Parent Unit', kind: 'contentRef', target: 'department', section: 'relations', hint: 'Used to draw the organizational chart.' },
      { name: 'headResearcherId', label: 'Head of Unit', kind: 'contentRef', target: 'researcher', section: 'relations' },
      { name: 'phone', label: 'Phone', kind: 'text', section: 'main' },
      { name: 'email', label: 'Email', kind: 'text', section: 'main' },
      { name: 'room', label: 'Room', kind: 'text', section: 'main' },
      { name: 'sortOrder', label: 'Display Order', kind: 'number', section: 'meta' },
    ),
  },
  {
    key: 'research_direction',
    label: 'Research Directions',
    detailModel: 'researchDirection',
    navOrder: 110,
    navGroup: 'science',
    hasPreview: false,
    needsReview: false,
    fields: core(
      { name: 'leadResearcherId', label: 'Direction Lead', kind: 'contentRef', target: 'researcher', section: 'relations' },
      { name: 'members', label: 'Researchers', kind: 'people', section: 'relations' },
      { name: 'projects', label: 'Projects', kind: 'contentRef', target: 'research_project', many: true, section: 'relations' },
      { name: 'code', label: 'Code', kind: 'text', section: 'main' },
      { name: 'sortOrder', label: 'Display Order', kind: 'number', section: 'meta' },
    ),
  },
  {
    key: 'research_project',
    label: 'Research Projects',
    detailModel: 'researchProject',
    navOrder: 120,
    navGroup: 'science',
    hasPreview: false,
    needsReview: false,
    categoryScope: 'project',
    fields: core(
      { name: 'code', label: 'Project Code', kind: 'text', section: 'main' },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'project', section: 'taxonomy' },
      { name: 'directionId', label: 'Research Direction', kind: 'contentRef', target: 'research_direction', section: 'relations' },
      { name: 'fundingSource', label: 'Funding Source', kind: 'text', section: 'main' },
      { name: 'budget', label: 'Budget', kind: 'text', section: 'main' },
      { name: 'startYear', label: 'Start Year', kind: 'number', section: 'meta' },
      { name: 'endYear', label: 'End Year', kind: 'number', section: 'meta' },
      { name: 'stage', label: 'Status', kind: 'select', section: 'meta', options: [
        { value: 'planned', label: 'Planned' },
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' },
      ] },
      { name: 'members', label: 'Participants', kind: 'people', section: 'relations' },
    ),
  },
  {
    key: 'partner',
    label: 'International Partners',
    detailModel: 'partner',
    navOrder: 130,
    navGroup: 'science',
    hasPreview: false,
    needsReview: false,
    categoryScope: 'partner',
    fields: core(
      { name: 'organization', label: 'Organization', kind: 'text', section: 'main' },
      { name: 'country', label: 'Country', kind: 'text', required: true, section: 'main' },
      { name: 'orgType', label: 'Organization Type', kind: 'select', section: 'main', options: [
        { value: 'university', label: 'University' },
        { value: 'research_institute', label: 'Research Institute' },
        { value: 'museum', label: 'Museum' },
        { value: 'archive', label: 'Archive' },
        { value: 'ngo', label: 'NGO' },
        { value: 'government', label: 'Government body' },
      ] },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'partner', section: 'taxonomy' },
      { name: 'website', label: 'Website', kind: 'url', section: 'main' },
      { name: 'logo', label: 'Logo', kind: 'media', section: 'media' },
      { name: 'agreementNumber', label: 'Agreement Number', kind: 'text', section: 'main' },
      { name: 'signedAt', label: 'Agreement Signed', kind: 'date', section: 'meta' },
      { name: 'validFrom', label: 'Valid From', kind: 'date', section: 'meta' },
      { name: 'validTo', label: 'Valid To', kind: 'date', section: 'meta' },
      { name: 'isActive', label: 'Active Partnership', kind: 'checkbox', section: 'meta' },
      { name: 'projects', label: 'Joint Projects', kind: 'contentRef', target: 'research_project', many: true, section: 'relations' },
    ),
  },
  {
    key: 'document',
    label: 'Documents',
    detailModel: 'document',
    navOrder: 140,
    navGroup: 'media',
    hasPreview: false,
    needsReview: false,
    categoryScope: 'document',
    fields: core(
      { name: 'kind', label: 'Document Type', kind: 'select', section: 'main', options: [
        { value: 'official', label: 'Official document' },
        { value: 'report', label: 'Report' },
        { value: 'regulation', label: 'Regulation' },
        { value: 'order', label: 'Order' },
        { value: 'conference_program', label: 'Conference program' },
        { value: 'other', label: 'Other' },
      ] },
      { name: 'categoryId', label: 'Category', kind: 'category', scope: 'document', section: 'taxonomy' },
      { name: 'docNumber', label: 'Document Number', kind: 'text', section: 'main' },
      { name: 'issuedAt', label: 'Issue Date', kind: 'date', section: 'meta' },
      { name: 'file', label: 'File', kind: 'mediaList', required: true, section: 'media', hint: 'PDF, DOCX or XLSX. Replacing the file keeps the same download URL.' },
    ),
  },
  {
    key: 'page',
    label: 'Pages',
    detailModel: 'page',
    navOrder: 150,
    navGroup: 'content',
    hasPreview: true,
    needsReview: true,
    fields: core(
      { name: 'template', label: 'Template', kind: 'select', section: 'main', options: [
        { value: 'standard', label: 'Standard' },
        { value: 'landing', label: 'Landing' },
        { value: 'full_width', label: 'Full width' },
        { value: 'sidebar', label: 'With sidebar' },
      ] },
      { name: 'pathOverride', label: 'URL Path', kind: 'text', section: 'meta', hint: 'Leave empty to use the slug.' },
      { name: 'showInBreadcrumbs', label: 'Show in Breadcrumbs', kind: 'checkbox', section: 'meta' },
      { name: 'sortOrder', label: 'Display Order', kind: 'number', section: 'meta' },
    ),
  },
  {
    key: 'journal',
    label: 'Journals',
    detailModel: 'journal',
    navOrder: 160,
    navGroup: 'science',
    hasPreview: false,
    needsReview: false,
    fields: core(
      { name: 'issn', label: 'ISSN', kind: 'text', section: 'main' },
      { name: 'eissn', label: 'eISSN', kind: 'text', section: 'main' },
      { name: 'website', label: 'Website', kind: 'url', section: 'main' },
      { name: 'foundedYear', label: 'Founded Year', kind: 'number', section: 'meta' },
    ),
  },
];

export const CONTENT_TYPE_MAP = new Map(CONTENT_TYPES.map((t) => [t.key, t]));

export function getContentTypeDef(key: string): ContentTypeDef {
  const def = CONTENT_TYPE_MAP.get(key);
  if (!def) throw new Error(`Unknown content type: ${key}`);
  return def;
}

export const NAV_GROUPS: { key: ContentTypeDef['navGroup']; label: string }[] = [
  { key: 'content', label: 'Content' },
  { key: 'science', label: 'Science' },
  { key: 'structure', label: 'Structure' },
  { key: 'media', label: 'Media' },
  { key: 'system', label: 'System' },
];

/** Reserved field names stored on ContentItem rather than on the detail table. */
export const CORE_FIELD_NAMES = new Set([
  'title', 'subtitle', 'slug', 'lang', 'excerpt', 'body', 'author', 'publishedAt', 'tags',
  'seoTitle', 'seoDescription', 'keywords', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImage',
  'status', 'mainImage', 'gallery', 'attachments',
]);

/** Fields that live on ContentGroup, i.e. shared by every language version of a material. */
export const GROUP_FIELD_NAMES = new Set(['isFeatured']);

/** Field kinds whose value is stored as a JSON array in the form, not as a plain input. */
export const STRUCTURED_FIELD_KINDS = new Set<FieldKind>([
  'media', 'mediaGallery', 'mediaList', 'authors', 'people', 'contentRef',
]);

/**
 * MediaLink.role for each media field. A type can hold two file lists at once (a book has
 * attachments and its full-text PDF), so every field gets its own role value instead of sharing
 * 'attachment' — that is what lets the public site place each list in the right block.
 */
export const MEDIA_FIELD_ROLE: Record<string, MediaLinkRole> = {
  mainImage: 'main',
  gallery: 'gallery',
  attachments: 'attachment',
  ogImage: 'og',
  cover: 'cover',
  photo: 'photo',
  logo: 'logo',
  fullText: 'fulltext',
  digitalFiles: 'digital',
  documents: 'documents',
  videos: 'video',
  file: 'file',
};

export type MediaLinkRole =
  | 'main' | 'gallery' | 'attachment' | 'og' | 'cover' | 'photo' | 'logo'
  | 'fulltext' | 'digital' | 'documents' | 'video' | 'file';

/** Prisma relation name of the detail table, per content type key. */
export const DETAIL_KEY_BY_TYPE = {
  news: 'news',
  article: 'article',
  book: 'book',
  publication: 'publication',
  manuscript: 'manuscript',
  dissertation: 'dissertation',
  event: 'event',
  announcement: 'announcement',
  researcher: 'researcher',
  department: 'department',
  research_direction: 'researchDirection',
  research_project: 'researchProject',
  partner: 'partner',
  document: 'document',
  page: 'page',
  journal: 'journal',
} as const satisfies Record<string, string>;

export type DetailKey = (typeof DETAIL_KEY_BY_TYPE)[keyof typeof DETAIL_KEY_BY_TYPE];

export const STATUS_OPTIONS_FOR_ADMIN = STATUS_OPTIONS;
