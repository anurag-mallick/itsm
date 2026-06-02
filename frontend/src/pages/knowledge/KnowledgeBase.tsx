import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Typography,
  Input,
  Row,
  Col,
  Card,
  Tag,
  Space,
  Spin,
  Empty,
  message,
  Divider,
  Button,
  Layout,
  Menu,
  Breadcrumb,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  LikeOutlined,
  DislikeOutlined,
  BookOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';

const { Title, Text, Paragraph } = Typography;
const { Sider, Content } = Layout;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  category_name: string;
  category_id: number;
  tags: string[];
  view_count: number;
  helpful_yes: number;
  helpful_no: number;
  created_at: string;
  updated_at: string;
}

interface ArticlesResponse {
  results: Article[];
}

interface VoteResponse {
  helpful_yes: number;
  helpful_no: number;
}

// ---------------------------------------------------------------------------
// Article list view
// ---------------------------------------------------------------------------

interface ArticleListProps {
  articles: Article[];
  loading: boolean;
  onSelect: (article: Article) => void;
}

const ArticleList: React.FC<ArticleListProps> = ({ articles, loading, onSelect }) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (articles.length === 0) {
    return <Empty description="No articles found." style={{ marginTop: 60 }} />;
  }
  return (
    <Row gutter={[16, 16]}>
      {articles.map((article) => (
        <Col key={article.id} xs={24} md={12} xl={8}>
          <Card
            hoverable
            onClick={() => onSelect(article)}
            style={{ height: '100%' }}
            styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
          >
            <div style={{ flex: 1 }}>
              <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 6 }}>
                {article.title}
              </Text>
              <Paragraph
                ellipsis={{ rows: 2 }}
                style={{ color: '#595959', fontSize: 13, marginBottom: 10 }}
              >
                {article.content.slice(0, 150)}
              </Paragraph>
            </div>
            <Space size={4} wrap>
              <Tag color="blue">{article.category_name}</Tag>
              {article.tags.slice(0, 3).map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </Space>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                gap: 12,
                color: '#8c8c8c',
                fontSize: 12,
              }}
            >
              <span>
                <EyeOutlined style={{ marginRight: 4 }} />
                {article.view_count}
              </span>
              <span>
                <LikeOutlined style={{ marginRight: 4 }} />
                {article.helpful_yes}
              </span>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

// ---------------------------------------------------------------------------
// Article detail view
// ---------------------------------------------------------------------------

interface ArticleDetailViewProps {
  article: Article;
  onBack: () => void;
}

const ArticleDetailView: React.FC<ArticleDetailViewProps> = ({ article, onBack }) => {
  const [helpfulYes, setHelpfulYes] = useState(article.helpful_yes);
  const [helpfulNo, setHelpfulNo] = useState(article.helpful_no);
  const [voted, setVoted] = useState<'yes' | 'no' | null>(null);
  const [voting, setVoting] = useState(false);

  const handleVote = async (vote: 'yes' | 'no') => {
    if (voted) return;
    setVoting(true);
    try {
      const { data } = await client.post<VoteResponse>(
        `/knowledge/articles/${article.id}/vote/`,
        { vote },
      );
      setHelpfulYes(data.helpful_yes);
      setHelpfulNo(data.helpful_no);
      setVoted(vote);
    } catch {
      message.error('Failed to record your vote.');
    } finally {
      setVoting(false);
    }
  };

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          {
            href: '#',
            title: (
              <span onClick={onBack} style={{ cursor: 'pointer' }}>
                <HomeOutlined style={{ marginRight: 4 }} />
                Knowledge Base
              </span>
            ),
          },
          { title: article.category_name },
          { title: article.title },
        ]}
      />

      <Space style={{ marginBottom: 8 }} wrap>
        <Tag color="blue">{article.category_name}</Tag>
        {article.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </Space>

      <Title level={3} style={{ marginTop: 8, marginBottom: 4 }}>
        {article.title}
      </Title>

      <Space style={{ marginBottom: 20, color: '#8c8c8c', fontSize: 13 }}>
        <span>
          <EyeOutlined style={{ marginRight: 4 }} />
          {article.view_count} views
        </span>
        <Divider type="vertical" />
        <span>Updated {new Date(article.updated_at).toLocaleDateString()}</span>
      </Space>

      <div
        style={{
          background: '#fafafa',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: 1.75,
            margin: 0,
            color: '#262626',
          }}
        >
          {article.content}
        </pre>
      </div>

      <Divider />

      <div style={{ textAlign: 'center' }}>
        <Text style={{ display: 'block', marginBottom: 12, fontWeight: 500 }}>
          Was this article helpful?
        </Text>
        <Space size={12}>
          <Tooltip title={voted ? 'You already voted' : 'Mark as helpful'}>
            <Button
              icon={<LikeOutlined />}
              onClick={() => handleVote('yes')}
              disabled={!!voted}
              loading={voting && voted === null}
              type={voted === 'yes' ? 'primary' : 'default'}
            >
              Yes ({helpfulYes})
            </Button>
          </Tooltip>
          <Tooltip title={voted ? 'You already voted' : 'Mark as not helpful'}>
            <Button
              icon={<DislikeOutlined />}
              onClick={() => handleVote('no')}
              disabled={!!voted}
              danger={voted === 'no'}
            >
              No ({helpfulNo})
            </Button>
          </Tooltip>
        </Space>
        {voted && (
          <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
            Thank you for your feedback.
          </Text>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const KnowledgeBase: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [articles, setArticles] = useState<Article[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get<ArticlesResponse>('/knowledge/public/');
      const list = data.results ?? [];
      setArticles(list);
      setFilteredArticles(list);
    } catch {
      message.error('Failed to load knowledge base articles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // If a slug is in the URL, load that article
  useEffect(() => {
    if (slug && articles.length > 0) {
      const found = articles.find((a) => a.slug === slug);
      if (found) setSelectedArticle(found);
    }
  }, [slug, articles]);

  // Category filter
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredArticles(articles);
    } else {
      setFilteredArticles(
        articles.filter((a) => a.category_name === selectedCategory),
      );
    }
  }, [selectedCategory, articles]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q.trim()) {
      setFilteredArticles(
        selectedCategory === 'all'
          ? articles
          : articles.filter((a) => a.category_name === selectedCategory),
      );
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await client.get<ArticlesResponse>(
          '/knowledge/search/',
          { params: { q } },
        );
        setFilteredArticles(data.results ?? []);
      } catch {
        // Fallback to client-side filter
        const lower = q.toLowerCase();
        setFilteredArticles(
          articles.filter(
            (a) =>
              a.title.toLowerCase().includes(lower) ||
              a.content.toLowerCase().includes(lower),
          ),
        );
      } finally {
        setSearchLoading(false);
      }
    }, 350);
  }

  function handleSelectArticle(article: Article) {
    setSelectedArticle(article);
    navigate(`/knowledge/${article.slug}`);
  }

  function handleBack() {
    setSelectedArticle(null);
    navigate('/knowledge');
  }

  // Build categories for sidebar menu
  const categories = Array.from(new Set(articles.map((a) => a.category_name)));
  const sidebarItems = [
    { key: 'all', label: `All Articles (${articles.length})`, icon: <BookOutlined /> },
    ...categories.map((cat) => ({
      key: cat,
      label: `${cat} (${articles.filter((a) => a.category_name === cat).length})`,
    })),
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Knowledge Base
        </Title>
        <Text type="secondary">Browse and search IT knowledge articles</Text>
      </div>

      {/* Search bar */}
      <Input
        size="large"
        prefix={searchLoading ? <Spin size="small" /> : <SearchOutlined style={{ color: '#bbb' }} />}
        placeholder="Search articles..."
        value={searchQuery}
        onChange={handleSearchChange}
        allowClear
        onClear={() => {
          setSearchQuery('');
          setFilteredArticles(
            selectedCategory === 'all'
              ? articles
              : articles.filter((a) => a.category_name === selectedCategory),
          );
        }}
        style={{ marginBottom: 24 }}
      />

      {selectedArticle ? (
        <ArticleDetailView article={selectedArticle} onBack={handleBack} />
      ) : (
        <Layout style={{ background: 'transparent', gap: 16 }}>
          <Sider
            width={220}
            style={{
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: '8px 0',
            }}
          >
            <Menu
              mode="inline"
              selectedKeys={[selectedCategory]}
              onClick={({ key }) => setSelectedCategory(key)}
              items={sidebarItems}
              style={{ background: 'transparent', border: 'none' }}
            />
          </Sider>
          <Content>
            <ArticleList
              articles={filteredArticles}
              loading={loading}
              onSelect={handleSelectArticle}
            />
          </Content>
        </Layout>
      )}
    </div>
  );
};

export default KnowledgeBase;
