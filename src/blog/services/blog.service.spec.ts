import { BlogService } from './blog.service';

describe('BlogService', () => {
  const prisma = {
    blog: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const cacheService = {
    getCachedPost: jest.fn(),
    getCachedPostById: jest.fn(),
    cachePost: jest.fn(),
    cachePostById: jest.fn(),
  };

  const createService = () =>
    new BlogService(prisma as any, cacheService as any);

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getCachedPost.mockResolvedValue(null);
    cacheService.getCachedPostById.mockResolvedValue(null);
    cacheService.cachePost.mockResolvedValue(undefined);
    cacheService.cachePostById.mockResolvedValue(undefined);
  });

  describe('findBySlug', () => {
    it('returns an active public post when route param is the post id', async () => {
      const post = {
        id: 'd576cc42-6f52-4e00-914c-e315f50e91fe',
        slug: 'nau-shniki',
        title: 'Наушники',
        text: '<p>Вот так</p>',
        isActive: true,
      };
      prisma.blog.findFirst.mockResolvedValue(post);

      const result = await createService().findBySlug(post.id);

      expect(result).toBe(post);
      expect(prisma.blog.findFirst).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [{ slug: post.id }, { id: post.id }],
        },
      });
      expect(cacheService.cachePost).toHaveBeenCalledWith(post.slug, post);
      expect(cacheService.cachePostById).toHaveBeenCalledWith(post.id, post);
    });
  });
});
