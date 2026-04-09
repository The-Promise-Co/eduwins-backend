const { db, admin } = require('../config/firebase');

/**
 * Subscribe to premium features
 */
exports.subscribeToPremium = async (req, res) => {
  const { id: teacherId } = req.user;
  const { plan, paymentMethodId } = req.body;

  try {
    if (!plan || !['monthly', 'quarterly', 'annual'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid subscription plan' });
    }

    const plans = {
      monthly: { price: 5000, duration: 30, label: '₦5,000/month' },
      quarterly: { price: 12000, duration: 90, label: '₦12,000/3 months' },
      annual: { price: 40000, duration: 365, label: '₦40,000/year' },
    };

    const planDetails = plans[plan];
    const subscriptionId = db.ref('subscriptions').push().key;
    const currentTime = admin.database.ServerValue.TIMESTAMP;
    const endTime = Date.now() + planDetails.duration * 24 * 60 * 60 * 1000;

    const subscription = {
      id: subscriptionId,
      teacherId,
      plan,
      price: planDetails.price,
      duration: planDetails.duration,
      status: 'active',
      paymentMethodId,
      startDate: currentTime,
      endDate: endTime,
      autoRenew: true,
      createdAt: currentTime,
      updatedAt: currentTime,
    };

    // Create subscription record
    await db.ref(`subscriptions/${subscriptionId}`).set(subscription);

    // Update teacher profile
    await db.ref(`users/${teacherId}`).update({
      is_premium: true,
      subscription_active: true,
      subscription_id: subscriptionId,
      subscription_plan: plan,
      subscription_end_date: endTime,
      last_subscription_date: currentTime,
    });

    // Update teacher visibility (premium teachers rank higher in search)
    await db.ref(`teacher_profiles/${teacherId}`).update({
      is_premium: true,
      search_rank: 'premium',
    });

    res.status(201).json({
      message: `Successfully subscribed to ${plan} plan`,
      subscription,
      benefits: [
        'Upload subject videos with custom pricing',
        'Upload teaching materials (PDF/Word)',
        'Premium visibility in search results',
        'Access to advanced analytics',
        'Higher earnings potential',
      ],
    });
  } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: 'Subscription failed: ' + err.message });
  }
};

/**
 * Get teacher premium features and uploaded content
 */
exports.getTeacherPremiumContent = async (req, res) => {
  const { teacherId } = req.params;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Only accessible if teacher is premium
    if (!teacher.is_premium || !teacher.subscription_active) {
      return res.status(200).json({
        teacherId,
        isPremium: false,
        content: [],
        totalContent: 0,
      });
    }

    // Get subject videos
    const videosSnapshot = await db.ref('subject_videos')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');
    const videosData = videosSnapshot.val() || {};

    // Get teaching materials
    const materialsSnapshot = await db.ref('teaching_materials')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');
    const materialsData = materialsSnapshot.val() || {};

    // Combine content
    const content = [];

    Object.entries(videosData).forEach(([key, video]) => {
      content.push({
        id: key,
        type: 'video',
        ...video,
      });
    });

    Object.entries(materialsData).forEach(([key, material]) => {
      content.push({
        id: key,
        type: 'material',
        ...material,
      });
    });

    res.status(200).json({
      teacherId,
      isPremium: true,
      subscriptionActive: true,
      subscriptionEndDate: teacher.subscription_end_date,
      content: content,
      totalContent: content.length,
      totalVideos: Object.keys(videosData).length,
      totalMaterials: Object.keys(materialsData).length,
    });
  } catch (err) {
    console.error('Error fetching premium content:', err);
    res.status(500).json({ error: 'Failed to fetch premium content' });
  }
};

/**
 * Subscribe to teacher's subject video
 */
exports.subscribeToVideo = async (req, res) => {
  const userId = req.user.id || req.body.userId;
  const { videoId } = req.params;
  const { transactionId } = req.body; // Payment proof

  try {
    if (!userId || !videoId) {
      return res.status(400).json({ error: 'User ID and Video ID required' });
    }

    const videoSnapshot = await db.ref(`subject_videos/${videoId}`).once('value');
    const video = videoSnapshot.val();

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Check if already subscribed
    if (video.subscribers && video.subscribers.includes(userId)) {
      return res.status(400).json({ error: 'Already subscribed to this video' });
    }

    // Add user to subscribers
    const newSubscribers = video.subscribers || [];
    newSubscribers.push(userId);

    await db.ref(`subject_videos/${videoId}`).update({
      subscribers: newSubscribers,
    });

    // Record access
    const accessId = db.ref('video_access').push().key;
    await db.ref(`video_access/${accessId}`).set({
      id: accessId,
      userId,
      videoId,
      teacherId: video.teacherId,
      price: video.price,
      transactionId,
      accessGrantedAt: admin.database.ServerValue.TIMESTAMP,
      expiresAt: null, // Permanent access
    });

    res.status(200).json({
      message: 'Successfully subscribed to video',
      videoId,
      accessId,
      accessGrantedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Video subscription error:', err);
    res.status(500).json({ error: 'Failed to subscribe to video: ' + err.message });
  }
};

/**
 * Purchase teaching material
 */
exports.purchaseMaterial = async (req, res) => {
  const userId = req.user.id || req.body.userId;
  const { materialId } = req.params;
  const { transactionId } = req.body;

  try {
    if (!userId || !materialId) {
      return res.status(400).json({ error: 'User ID and Material ID required' });
    }

    const materialSnapshot = await db.ref(`teaching_materials/${materialId}`).once('value');
    const material = materialSnapshot.val();

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    // Create purchase record
    const purchaseId = db.ref('material_purchases').push().key;
    await db.ref(`material_purchases/${purchaseId}`).set({
      id: purchaseId,
      userId,
      materialId,
      teacherId: material.teacherId,
      price: material.price,
      transactionId,
      purchasedAt: admin.database.ServerValue.TIMESTAMP,
      downloadUrl: material.materialUrl,
    });

    // Update material download count
    await db.ref(`teaching_materials/${materialId}`).update({
      downloads: (material.downloads || 0) + 1,
      purchasers: [...(material.purchasers || []), userId],
    });

    res.status(200).json({
      message: 'Material purchased successfully',
      materialId,
      downloadUrl: material.materialUrl,
      fileName: material.title,
    });
  } catch (err) {
    console.error('Material purchase error:', err);
    res.status(500).json({ error: 'Failed to purchase material: ' + err.message });
  }
};

/**
 * Check if user has access to video
 */
exports.checkVideoAccess = async (req, res) => {
  const { userId } = req.query;
  const { videoId } = req.params;

  try {
    if (!userId || !videoId) {
      return res.status(400).json({ error: 'User ID and Video ID required' });
    }

    const accessSnapshot = await db.ref('video_access')
      .orderByChild('videoId')
      .equalTo(videoId)
      .once('value');

    const accesses = accessSnapshot.val() || {};
    const userAccess = Object.values(accesses).find((a) => a.userId === userId);

    if (userAccess) {
      return res.status(200).json({
        hasAccess: true,
        accessGrantedAt: userAccess.accessGrantedAt,
      });
    }

    res.status(200).json({ hasAccess: false });
  } catch (err) {
    console.error('Error checking video access:', err);
    res.status(500).json({ error: 'Failed to check access' });
  }
};

/**
 * Cancel subscription
 */
exports.cancelSubscription = async (req, res) => {
  const { id: teacherId } = req.user;
  const { immediately } = req.body; // If true, cancel immediately; else at period end

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    const subscriptionRef = db.ref(`subscriptions/${teacher.subscription_id}`);
    const subscriptionSnapshot = await subscriptionRef.once('value');
    const subscription = subscriptionSnapshot.val();

    const updateData = {
      status: immediately ? 'cancelled' : 'cancellation_pending',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    if (!immediately) {
      updateData.cancellationRequestedAt = admin.database.ServerValue.TIMESTAMP;
    }

    await subscriptionRef.update(updateData);

    // Update teacher profile
    await db.ref(`users/${teacherId}`).update({
      subscription_active: false,
      subscription_cancelled: true,
      subscription_cancelled_at: admin.database.ServerValue.TIMESTAMP,
    });

    res.status(200).json({
      message: immediately
        ? 'Subscription cancelled immediately'
        : 'Subscription will be cancelled at period end',
      subscription: updateData,
    });
  } catch (err) {
    console.error('Cancellation error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription: ' + err.message });
  }
};

/**
 * Get subscription status
 */
exports.getSubscriptionStatus = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.subscription_id) {
      return res.status(200).json({
        hasSubscription: false,
        message: 'No active subscription',
      });
    }

    const subscriptionSnapshot = await db.ref(`subscriptions/${teacher.subscription_id}`).once('value');
    const subscription = subscriptionSnapshot.val();

    const daysRemaining = Math.ceil((subscription.endDate - Date.now()) / (24 * 60 * 60 * 1000));

    res.status(200).json({
      hasSubscription: true,
      isPremium: teacher.is_premium,
      subscriptionActive: teacher.subscription_active,
      plan: subscription.plan,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      autoRenew: subscription.autoRenew,
    });
  } catch (err) {
    console.error('Error getting subscription status:', err);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
};

/**
 * Get authenticated teacher's own premium content
 */
exports.getTeacherOwnContent = async (req, res) => {
  const { id: teacherId } = req.user;

  try {
    const teacherSnapshot = await db.ref(`users/${teacherId}`).once('value');
    const teacher = teacherSnapshot.val();

    if (!teacher.is_premium || !teacher.subscription_active) {
      return res.status(403).json({
        error: 'Premium subscription required to manage content',
      });
    }

    // Get subject videos created by teacher
    const videosSnapshot = await db.ref('subject_videos')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');
    const videosData = videosSnapshot.val() || {};

    // Get teaching materials created by teacher
    const materialsSnapshot = await db.ref('teaching_materials')
      .orderByChild('teacherId')
      .equalTo(teacherId)
      .once('value');
    const materialsData = materialsSnapshot.val() || {};

    // Combine and format content
    const content = [];
    
    Object.entries(videosData).forEach(([key, video]) => {
      content.push({
        id: key,
        type: 'video',
        ...video,
      });
    });

    Object.entries(materialsData).forEach(([key, material]) => {
      content.push({
        id: key,
        type: 'material',
        ...material,
      });
    });

    res.status(200).json({
      teacherId,
      isPremium: true,
      subscriptionActive: true,
      subscriptionEndDate: teacher.subscription_end_date,
      content: content,
      totalContent: content.length,
      totalVideos: Object.keys(videosData).length,
      totalMaterials: Object.keys(materialsData).length,
    });
  } catch (err) {
    console.error('Error fetching teacher own content:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
};
