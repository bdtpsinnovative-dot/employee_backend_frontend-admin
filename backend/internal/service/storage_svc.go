package service

import (
	"context"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type StorageObject struct {
	Key         string
	Size        int64
	ETag        string
	ContentType string
}

type StorageService struct {
	client     *s3.Client
	bucketName string
	localRoot  string
}

// NewLocalStorageService creates the filesystem-backed store used by database
// save points.
func NewLocalStorageService(root string) (*StorageService, error) {
	if strings.TrimSpace(root) == "" {
		return nil, fmt.Errorf("local backup directory is not configured")
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absoluteRoot, 0o750); err != nil {
		return nil, fmt.Errorf("สร้างโฟลเดอร์ local backup ไม่สำเร็จ: %w", err)
	}
	return &StorageService{localRoot: absoluteRoot}, nil
}

func (s *StorageService) IsLocal() bool {
	return s != nil && s.localRoot != ""
}

func NewStorageService() (*StorageService, error) {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKey := os.Getenv("R2_ACCESS_KEY_ID")
	secretKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	bucketName := os.Getenv("R2_BUCKET_NAME")

	if accountID == "" || accessKey == "" || secretKey == "" || bucketName == "" {
		return nil, fmt.Errorf("R2 credentials not fully set in environment")
	}

	cfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		config.WithRegion("auto"),
		config.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
	)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(cfg, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(
			fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID),
		)
	})

	return &StorageService{
		client:     client,
		bucketName: bucketName,
	}, nil
}

// UploadFile uploads a file to R2 and returns its private object key.
func (s *StorageService) UploadFile(ctx context.Context, file io.Reader, fileName, contentType string) (string, error) {
	if err := s.uploadReader(ctx, file, fileName, contentType); err != nil {
		return "", err
	}
	return fileName, nil
}

func (s *StorageService) uploadReader(ctx context.Context, file io.Reader, fileName, contentType string) error {
	if s.IsLocal() {
		path, err := s.localPath(fileName)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return err
		}
		output, err := os.Create(path)
		if err != nil {
			return err
		}
		defer output.Close()
		_, err = io.Copy(output, file)
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucketName),
		Key:         aws.String(fileName),
		Body:        file,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return err
	}
	return nil
}

func (s *StorageService) UploadObject(ctx context.Context, file io.Reader, objectKey, contentType string) error {
	return s.uploadReader(ctx, file, objectKey, contentType)
}

func (s *StorageService) DownloadObject(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	if s.IsLocal() {
		path, err := s.localPath(objectKey)
		if err != nil {
			return nil, err
		}
		return os.Open(path)
	}
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, err
	}
	return result.Body, nil
}

func (s *StorageService) ListObjects(ctx context.Context, prefix string) ([]StorageObject, error) {
	if s.IsLocal() {
		return s.listLocalObjects(prefix)
	}
	objects := []StorageObject{}
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucketName),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, object := range page.Contents {
			if object.Key == nil {
				continue
			}
			storageObject := StorageObject{
				Key:  aws.ToString(object.Key),
				Size: aws.ToInt64(object.Size),
			}
			if object.ETag != nil {
				storageObject.ETag = aws.ToString(object.ETag)
			}
			objects = append(objects, storageObject)
		}
	}

	return objects, nil
}

func (s *StorageService) ObjectContentType(ctx context.Context, objectKey string) (string, error) {
	if s.IsLocal() {
		if _, err := s.localPath(objectKey); err != nil {
			return "", err
		}
		return mime.TypeByExtension(filepath.Ext(objectKey)), nil
	}
	head, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return "", err
	}
	if head.ContentType == nil {
		return "", nil
	}
	return aws.ToString(head.ContentType), nil
}

func (s *StorageService) CopyObject(ctx context.Context, sourceKey, destinationKey, contentType string) error {
	return s.CopyObjectFrom(ctx, s, sourceKey, destinationKey, contentType)
}

func (s *StorageService) CopyObjectFrom(ctx context.Context, source *StorageService, sourceKey, destinationKey, contentType string) error {
	body, err := source.DownloadObject(ctx, sourceKey)
	if err != nil {
		return err
	}
	defer body.Close()

	return s.UploadObject(ctx, body, destinationKey, contentType)
}

func (s *StorageService) DeletePrefix(ctx context.Context, prefix string) error {
	objects, err := s.ListObjects(ctx, prefix)
	if err != nil {
		return err
	}
	for _, object := range objects {
		if err := s.DeleteObject(ctx, object.Key); err != nil {
			return err
		}
	}
	return nil
}

func (s *StorageService) DeleteObject(ctx context.Context, objectKey string) error {
	if s.IsLocal() {
		path, err := s.localPath(objectKey)
		if err != nil {
			return err
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(objectKey),
	})
	return err
}

func (s *StorageService) localPath(objectKey string) (string, error) {
	if !s.IsLocal() {
		return "", fmt.Errorf("storage is not local")
	}
	cleanKey := filepath.Clean(filepath.FromSlash(objectKey))
	if cleanKey == "." || cleanKey == ".." || strings.HasPrefix(cleanKey, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid storage object key")
	}
	return filepath.Join(s.localRoot, cleanKey), nil
}

func (s *StorageService) listLocalObjects(prefix string) ([]StorageObject, error) {
	objects := make([]StorageObject, 0)
	err := filepath.WalkDir(s.localRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(s.localRoot, path)
		if err != nil {
			return err
		}
		key := filepath.ToSlash(relative)
		if !strings.HasPrefix(key, prefix) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		objects = append(objects, StorageObject{
			Key:  key,
			Size: info.Size(),
		})
		return nil
	})
	if os.IsNotExist(err) {
		return objects, nil
	}
	return objects, err
}
