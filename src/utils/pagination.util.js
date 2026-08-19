  const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 1000);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
  };
  module.exports = { getPagination };
